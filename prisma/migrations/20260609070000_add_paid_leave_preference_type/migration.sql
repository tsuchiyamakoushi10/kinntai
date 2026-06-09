-- シフト希望に「有給」(paid_leave) を追加する。
-- enum への値追加は非破壊。既存行・既存コードには影響しない。
ALTER TYPE "shift_preference_type" ADD VALUE IF NOT EXISTS 'paid_leave';
