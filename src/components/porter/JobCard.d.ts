import type { FC } from "react";
declare const JobCard: FC<{ job: Record<string, any>; today: string; showDay?: boolean; onDone: (reference: string) => Promise<void> }>;
export default JobCard;
