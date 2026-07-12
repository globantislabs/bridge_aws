import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND}/api`;

export const api = axios.create({
  baseURL: API,
  timeout: 30000,
  withCredentials: true,
});

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("bridge:token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export const LANGUAGES = [
  { code: "en", name: "English", flag: "EN" },
  { code: "es", name: "Spanish", flag: "ES" },
  { code: "hi", name: "Hindi", flag: "HI" },
  { code: "zh", name: "Mandarin", flag: "ZH" },
  { code: "fr", name: "French", flag: "FR" },
  { code: "de", name: "German", flag: "DE" },
  { code: "ar", name: "Arabic", flag: "AR" },
  { code: "pt", name: "Portuguese", flag: "PT" },
  { code: "ja", name: "Japanese", flag: "JA" },
  { code: "ru", name: "Russian", flag: "RU" },
];

export const languageName = (code) =>
  (LANGUAGES.find((l) => l.code === code) || { name: code }).name;
