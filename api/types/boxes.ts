export interface BoxType {
  id: number;
  translations: { segment: string };
}

export interface BoxSetting {
  id: number;
  prop_name: string;
  properties: Record<string, unknown>;
}

export interface Box {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  cloudinary_image: string;
  bio: string | null;
  website: string | null;
  has_regular_clients: number;
  recurring_payments_charge_day: number | null;
  epidemic_mode: number;
  notification_scheduling: number;
  external_url_id: string;
  box_type_fk: number;
  box_type: BoxType;
  boxes_settings: BoxSetting[] | null;
}

export interface DisabledPage {
  locations_box_id: number;
  area: string;
  section_name: string;
}

// Embedded in GET /api/v2/boxes
export interface LocationsBox {
  id: number;
  qr_code: number;
  logo: string | null;
  time_format: string;
  date_format: string;
  timezone: string;
  country_code: string;
  currency: string;
  currency_symbol: string;
  has_shop: boolean;
  disable_pages_app: DisabledPage[];
}

export interface BoxMembership {
  ub_id: number;
  id: number;
  first_name: string;
  last_name: string;
  birthday: string | null;
  personal_id: string | null;
  gender: string;
  phone: string;
  additional_phone: string | null;
  user_fk: number;
  box_fk: number;
  locations_box_fk: number;
  medical_cert: number;
  epidemic_statement: number;
  has_waiver: number;
  active: number;
  rolesArray: number[];
  full_name: string;
  total_debt: number;
  age: string | null;
  user_image: string;
  is_app_deleted: boolean;
  schedule_favorites: number[];
  properties: unknown[];
  group_connection: unknown | null;
  box: Box;
  locations_box: LocationsBox;
}

export interface BoxesResponse {
  data: BoxMembership[];
}

// Returned by GET /api/v2/boxes/locations (richer form with feature flags)
export interface LocationsBoxInfo {
  id: number;
  location: string;
  box_fk: number;
  logo: string | null;
  timezone: string;
  qr_code: number;
  hasAvailability: number;
  hasSpaceAvailability: number;
  hasWorkshops: number;
  hasHugim: number;
  hasPayments: boolean;
  hasMemberships: boolean;
  hasProducts: boolean;
  custom_field: unknown[];
  currency_symbol: string;
  has_shop: boolean;
  disable_pages_app: DisabledPage[];
}

export interface BoxWithLocations {
  id: number;
  name: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string | null;
  cloudinary_image: string;
  box_type_fk: number;
  schedule_standby_offset: number;
  epidemic_mode: number;
  showing_classes_week_ago: number;
  showing_classes_day_ago: number | null;
  showing_classes_time_ago: number | null;
  has_regular_clients: number;
  notification_scheduling: number;
  standby_cancellation_time: number;
  schedule_swapping_time: number;
  schedule_swapping_standby_time: number;
  time_card: number;
  external_url_id: string;
  bio: string | null;
  allow_sms_to_waiting_list: number;
  allow_relative_payment: number;
  digital_form_id: unknown | null;
  notify_session_owner: number;
  scheduleTypes: { hasClasses: number; hasHistory: number };
  locations_box: LocationsBoxInfo[];
}

export interface BoxLocationsResponse {
  data: BoxWithLocations[];
}
