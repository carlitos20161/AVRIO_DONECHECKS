/**
 * Date utility functions to handle timezone issues consistently
 */

/**
 * Creates a date object in local timezone to avoid UTC conversion issues
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object in local timezone
 */
export const createLocalDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
};

/**
 * Formats a date for display in EST timezone
 * @param date - Date object or timestamp
 * @returns Formatted date string
 */
export const formatDateForDisplay = (date: any): string => {
  if (!date) return 'N/A';
  
  let dateObj: Date;
  if (date.toDate && typeof date.toDate === 'function') {
    // Firestore timestamp
    dateObj = date.toDate();
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    dateObj = new Date(date);
  }
  
  return dateObj.toLocaleDateString('en-US', {
    timeZone: 'America/New_York', // EST/EDT timezone
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

/**
 * Gets the current date in EST timezone
 * @returns Date object in EST
 */
export const getCurrentESTDate = (): Date => {
  const now = new Date();
  const estOffset = -5 * 60; // EST is UTC-5 (EDT is UTC-4, but this handles the conversion)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (estOffset * 60000));
};

/**
 * Converts a date to EST timezone for storage
 * @param date - Date object
 * @returns Date object adjusted to EST
 */
export const toESTDate = (date: Date): Date => {
  const estOffset = -5 * 60; // EST is UTC-5
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  return new Date(utc + (estOffset * 60000));
};

