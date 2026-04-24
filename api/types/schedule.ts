export interface BookClassRequest {
  scheduleFk: number;
  locationsBoxFk: number;
  boxFk: number;
  usersFk: number;
}

export interface CancelClassRequest {
  scheduleFk: number;
  locationsBoxFk: number;
  boxFk: number;
}
