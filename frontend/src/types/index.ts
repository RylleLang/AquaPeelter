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

// --Filtration cycles (backend FiltrationCycle + sensor compare endpoint)--
export type CycleStatus = 'idle' | 'running' | 'paused' | 'completed';

export interface SamplePointAverages {
    avgPh?: number | null;
    avgTurbidity?: number | null;
    avgTds?: number | null;
    readingCount?: number;
}

/** Per-cycle result computed by the backend when a cycle completes. */
export interface CycleSummary {
    preFilter?: SamplePointAverages;
    postFilter?: SamplePointAverages;
    phImprovement?: number | null;      // % change pre → post
    turbidityReduction?: number | null; // % reduction pre → post
    tdsReduction?: number | null;       // % reduction pre → post
}

export interface FiltrationCycle {
    _id: string;
    cycleNumber: number;
    startedAt: string;
    completedAt?: string | null;
    durationSeconds?: number | null;
    status: 'running' | 'paused' | 'completed' | 'aborted';
    summary?: CycleSummary;
    notes?: string;
}

export interface CyclesResponse {
    success: boolean;
    total: number;
    count: number;
    data: FiltrationCycle[];
}

/** GET /sensors/:id/compare — pre vs post averages for a date range. */
export interface CompareResult {
    preFilter: SamplePointAverages;
    postFilter: SamplePointAverages;
    improvement: {
        ph: number | null;
        turbidity: number | null;
        tds: number | null;
    };
}
