const API_BASE_URL =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:5004";

export const getApiUrl = (path: string) => {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with '/': received "${path}"`);
  }
  return `${API_BASE_URL}${path}`;
};

export const apiBaseUrl = API_BASE_URL;

