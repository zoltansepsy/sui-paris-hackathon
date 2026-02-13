// app/services/authService.ts
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

import { getSuiClient } from '../lib/suiClient';
import {
  GOOGLE_CLIENT_ID,
  PROVER_URL,
  REDIRECT_URL,
  OPENID_PROVIDER_URL,
} from '../constants';

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  jwtToAddress,
  genAddressSeed,
  getZkLoginSignature,
} from '@mysten/sui/zklogin';

// Type for serialized signatures (not exported from SDK)
type SerializedSignature = string;  

const JWT_KEY = 'sui_jwt_token';
const JWT_DATA_KEY = 'jwt_data';
const EPHEMERAL_KEYPAIR_KEY = 'ephemeral_keypair';

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
}

// Tipo que devuelve el prover de Mysten (sin addressSeed, que lo calculamos nosotros)
export type PartialZkLoginSignature = Omit<
  Parameters<typeof getZkLoginSignature>['0']['inputs'],
  'addressSeed'
>;

export class AuthService {
  // ========= Helpers de estado en sessionStorage =========

  private static getJwtData() {
    const raw = sessionStorage.getItem(JWT_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  static jwt(): string | null {
    return sessionStorage.getItem(JWT_KEY);
  }

  private static decodeJwt(): JwtPayload {
    const jwt = AuthService.jwt();
    if (!jwt) {
      throw new Error('No JWT in sessionStorage');
    }
    return jwtDecode<JwtPayload>(jwt);
  }

  private static claims(): Record<string, any> {
    const token = AuthService.jwt();
    if (!token) return {};
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload));
  }

  static isAuthenticated(): boolean {
    const token = AuthService.jwt();
    return !!token && token !== 'null';
  }

  // ========= Salt & dirección =========

  // Para demo/hackathon: salt derivado del email (no es ideal para producción)
  private static salt(): string {
    const email = AuthService.claims()['email'] as string;

    // Hash estable del email, siempre positivo
    let h = 0;
    for (let i = 0; i < email.length; i++) {
      h = (h * 31 + email.charCodeAt(i)) >>> 0; // fuerza positivo 32 bits
    }

    return h.toString(); // un entero válido dentro del campo
  }

  static walletAddress(): string {
    const jwt = AuthService.jwt();
    if (!jwt) throw new Error('No JWT');
    return jwtToAddress(jwt, AuthService.salt());
  }

  static getAddressSeed(): string {
    const jwtPayload = AuthService.decodeJwt();
    const salt = AuthService.salt();
    const aud = Array.isArray(jwtPayload.aud)
      ? jwtPayload.aud[0]
      : jwtPayload.aud;

    if (!jwtPayload.sub || !aud) {
      throw new Error('Missing sub/aud in JWT');
    }

    return genAddressSeed(
      BigInt(salt),
      'sub',
      jwtPayload.sub,
      aud,
    ).toString();
  }

  // Hash cutre para derivar un número desde el email (como en el tutorial)
  private static hashcode(s: string): string {
    let h = 0;
    const l = s.length;
    for (let i = 0; i < l; i++) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0;
    }
    return h.toString();
  }

  // ========= Clave efímera & epoch =========

  static getEd25519Keypair(): Ed25519Keypair {
  const stored = sessionStorage.getItem(EPHEMERAL_KEYPAIR_KEY);
    if (!stored) throw new Error("Missing ephemeral key");

    const { privateKey } = JSON.parse(stored);

    const secretKeyBytes = Uint8Array.from(
      Buffer.from(privateKey, "base64")
    );
    return Ed25519Keypair.fromSecretKey(secretKeyBytes);
  }

  static getMaxEpoch(): number {
    const jwtData = AuthService.getJwtData();
    if (!jwtData) throw new Error('Missing jwt_data');
    return jwtData.maxEpoch;
  }

  static getRandomness(): string {
    const jwtData = AuthService.getJwtData();
    if (!jwtData) throw new Error('Missing jwt_data');
    return jwtData.randomness;
  }

  // ========= Llamada al prover de Mysten =========

  static async getPartialZkLoginSignature(): Promise<PartialZkLoginSignature> {
    const keyPair = AuthService.getEd25519Keypair();
    const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(
      keyPair.getPublicKey(),
    );

    const verificationPayload = {
      jwt: AuthService.jwt(),
      extendedEphemeralPublicKey,
      maxEpoch: AuthService.getMaxEpoch(),
      jwtRandomness: AuthService.getRandomness(),
      salt: AuthService.salt(),
      keyClaimName: 'sub',
    };

    try {
      const proofResponse = await axios.post(PROVER_URL, verificationPayload, {
        headers: { 'content-type': 'application/json' },
      });

      return proofResponse.data as PartialZkLoginSignature;
    } catch (error) {
      console.error('Failed to request partial zkLogin sig:', error);
      throw error;
    }
  }

  static async generateZkLoginSignature(
    userSignature: SerializedSignature,
  ): Promise<SerializedSignature> {
    const partialZkLoginSignature = await AuthService.getPartialZkLoginSignature();
    const addressSeed = AuthService.getAddressSeed();
    const maxEpoch = AuthService.getMaxEpoch();

    return getZkLoginSignature({
      inputs: {
        ...partialZkLoginSignature,
        addressSeed,
      },
      maxEpoch,
      userSignature,
    });
  }

  // ========= Login (primer paso: redirigir a Google) =========

  async login(): Promise<void> {
    // 1) Preguntamos epoch y fijamos maxEpoch
    const suiClient = getSuiClient();
    const { epoch } = await suiClient.getLatestSuiSystemState();
    const maxEpoch = Number(epoch) + 2222; // margen generoso para hackathon

    // 2) Clave efímera + randomness + nonce
    const ephemeralKeyPair = new Ed25519Keypair();
    const randomness = generateRandomness();
    const nonce = generateNonce(
      ephemeralKeyPair.getPublicKey(),
      maxEpoch,
      randomness,
    );

    // Guardamos datos para la segunda fase (callback)
    const jwtData = {
      maxEpoch,
      nonce,
      randomness: randomness.toString(),
    };

    sessionStorage.setItem(JWT_DATA_KEY, JSON.stringify(jwtData));

    // Exportamos la clave efímera para reconstruirla tras el redirect
    const privateKey = Buffer.from(
      ephemeralKeyPair.getSecretKey()
    ).toString("base64");

    sessionStorage.setItem(
      EPHEMERAL_KEYPAIR_KEY,
      JSON.stringify({ privateKey })
    );

    // 3) Construimos URL OAuth
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URL,
      response_type: 'id_token',
      scope: 'openid email',
      nonce,
    });

    try {
      // Descubrimos el authorization_endpoint desde el OpenID config
      const { data } = await axios.get(OPENID_PROVIDER_URL);
      const authUrl = `${data.authorization_endpoint}?${params.toString()}`;
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating Google login:', error);
    }
  }

  // ========= Helpers para guardar el JWT en el callback =========

  static saveJwt(idToken: string) {
    sessionStorage.setItem(JWT_KEY, idToken);
  }

  static clearSession() {
    sessionStorage.removeItem(JWT_KEY);
    sessionStorage.removeItem(JWT_DATA_KEY);
    sessionStorage.removeItem(EPHEMERAL_KEYPAIR_KEY);
  }
}