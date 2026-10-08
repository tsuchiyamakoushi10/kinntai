import type { Scenario } from "../video";
import {
  adminLogin,
  employees,
  laborNoticeSettings,
  paidLeave,
  shiftPreferences,
  shiftTable,
} from "./admin";
import { laborNotice } from "./labor-notice";
import { firstLogin, staffShifts } from "./staff";
import { surveyAnswer, surveyCreate, surveyResults } from "./training-survey";

/** 動画の一覧 (番号順に並べる)。01〜09 は管理者向け、11〜 は職員向け */
export const SCENARIOS: Scenario[] = [
  adminLogin,
  shiftTable,
  laborNotice,
  laborNoticeSettings,
  surveyCreate,
  surveyResults,
  shiftPreferences,
  employees,
  paidLeave,
  firstLogin,
  staffShifts,
  surveyAnswer,
].sort((a, b) => a.id.localeCompare(b.id));
