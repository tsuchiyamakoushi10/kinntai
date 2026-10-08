/** マニュアル撮影に使うローカル開発用アカウント (prisma/seeds/users.ts の DEV_CREDENTIALS) */
export const MANUAL_ADMIN = { identifier: "admin@kinntai.local", password: "admin0000" };
export const MANUAL_STAFF = { identifier: "e0001@kinntai.local", password: "kinntai0000" };
/** 「はじめてのログイン」動画用。prepare-data で毎回初期パスワードに戻す */
export const FIRST_LOGIN_STAFF = { identifier: "e0004@kinntai.local", password: "kinntai0000" };
