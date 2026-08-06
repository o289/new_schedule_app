import type { CategoryResponse } from "#schemas/category";
import type {
  ScheduleCreate,
  ScheduleDateCreate,
  ScheduleDateResponse,
  ScheduleResponse,
} from "#schemas/schedule";

export type {
  CategoryResponse,
  ScheduleDateCreate,
  ScheduleDateResponse,
  ScheduleResponse,
};

export type ScheduleFormDate = ScheduleDateCreate & { id?: string };

export type ScheduleForm = Omit<ScheduleCreate, "dates"> & {
  id?: string;
  note: string;
  dates: ScheduleFormDate[];
};
