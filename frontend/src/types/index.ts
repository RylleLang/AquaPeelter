// --Maintenance--
const MAINTENANCE_TYPES = [
  'filter_replacement',
  'filter_cleaning',
  'system_inspection',
  'repair', 
  'other'
] as const;

export type MaintenanceType = typeof MAINTENANCE_TYPES[number];

export const MaintenanceType = {
    list: MAINTENANCE_TYPES,
};

export interface MaintenanceForm {
    type: MaintenanceType;
    title: string,
    body: string,
}

export interface MaintenanceRecord extends MaintenanceForm {
    _id: string;
    acknowledged: boolean;
    createdAt: string;
}
