export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginData {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  language: string;
  image: string;
  token: string;
  refreshToken: string;
  last_name_shorten: string;
  full_name_shorten: string;
  full_name: string;
  is_user: boolean;
  appNamesId: number;
}

export interface LoginResponse {
  data: LoginData;
}
