/**
 * Formatting Utilities
 * Helper functions for displaying blockchain data in user-friendly formats
 */

/**
 * Format MIST (smallest SUI unit) to SUI with decimal places
 * 1 SUI = 1,000,000,000 MIST
 *
 * @param mist Amount in MIST
 * @param decimals Number of decimal places (default: 2)
 * @returns Formatted string with SUI symbol
 */
export function formatSUI(mist: number, decimals: number = 2): string {
  const sui = mist / 1_000_000_000;
  return `${sui.toFixed(decimals)} SUI`;
}

/**
 * Format SUI amount to MIST (for transactions)
 *
 * @param sui Amount in SUI
 * @returns Amount in MIST
 */
export function suiToMist(sui: number): number {
  return Math.floor(sui * 1_000_000_000);
}

/**
 * Format timestamp to readable date string
 *
 * @param timestamp Unix timestamp in milliseconds
 * @param options Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDate(
  timestamp: number,
  options?: Intl.DateTimeFormatOptions
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  };
  return new Date(timestamp).toLocaleDateString(undefined, defaultOptions);
}

/**
 * Format timestamp to readable date and time
 *
 * @param timestamp Unix timestamp in milliseconds
 * @returns Formatted date and time string
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format deadline with time remaining
 *
 * @param deadline Unix timestamp in milliseconds
 * @returns Human-readable time remaining (e.g., "2 days left", "3 hours left")
 */
export function formatDeadline(deadline: number): string {
  const now = Date.now();
  const diff = deadline - now;

  if (diff < 0) {
    return "Expired";
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} left`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} left`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} left`;
  } else {
    return "Less than 1 minute left";
  }
}

/**
 * Check if deadline is approaching (within 24 hours)
 *
 * @param deadline Unix timestamp in milliseconds
 * @returns true if deadline is within 24 hours
 */
export function isDeadlineApproaching(deadline: number): boolean {
  const now = Date.now();
  const diff = deadline - now;
  const oneDayInMs = 24 * 60 * 60 * 1000;
  return diff > 0 && diff <= oneDayInMs;
}

/**
 * Check if deadline has passed
 *
 * @param deadline Unix timestamp in milliseconds
 * @returns true if deadline has passed
 */
export function isDeadlinePassed(deadline: number): boolean {
  return deadline < Date.now();
}

/**
 * Shorten Sui address for display
 * Example: 0x1234...5678
 *
 * @param address Full Sui address
 * @param startChars Number of characters to show at start (default: 6)
 * @param endChars Number of characters to show at end (default: 4)
 * @returns Shortened address
 */
export function shortenAddress(
  address: string,
  startChars: number = 6,
  endChars: number = 4
): string {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format large numbers with K, M, B suffixes
 *
 * @param num Number to format
 * @param decimals Number of decimal places
 * @returns Formatted string
 */
export function formatLargeNumber(num: number, decimals: number = 1): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(decimals) + "B";
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(decimals) + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(decimals) + "K";
  }
  return num.toString();
}

/**
 * Format percentage (0-100 to 0-1 and back)
 *
 * @param value Value between 0-100
 * @param decimals Number of decimal places
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format rating (scaled by 100 in contract to 0-5 display)
 * Contract stores: 450 for 4.50 stars
 *
 * @param rating Rating value (0-500)
 * @returns Formatted rating string (0.00-5.00)
 */
export function formatRating(rating: number): string {
  const stars = rating / 100;
  return stars.toFixed(2);
}

/**
 * Get relative time string (e.g., "2 hours ago", "3 days ago")
 *
 * @param timestamp Unix timestamp in milliseconds
 * @returns Relative time string
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return `${years} year${years > 1 ? "s" : ""} ago`;
  }
  if (months > 0) {
    return `${months} month${months > 1 ? "s" : ""} ago`;
  }
  if (weeks > 0) {
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }
  return "Just now";
}

/**
 * Validate SUI amount input
 *
 * @param value Input value
 * @returns true if valid SUI amount
 */
export function isValidSuiAmount(value: string): boolean {
  const num = parseFloat(value);
  return !isNaN(num) && num > 0 && num < 1_000_000_000;
}

/**
 * Parse SUI input to MIST
 *
 * @param value String input value
 * @returns MIST amount or null if invalid
 */
export function parseSuiInput(value: string): number | null {
  const num = parseFloat(value);
  if (isNaN(num) || num <= 0) {
    return null;
  }
  return suiToMist(num);
}
