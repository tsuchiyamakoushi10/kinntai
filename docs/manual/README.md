# 操作マニュアル・操作説明動画の作り方

`admin.md`（管理者向け）と `staff.md`（職員向け）が原稿。画面写真・PDF・動画はスクリプトで作り直せる（出力は `dist/manual/`、git には入れない）。

## 必要なもの (初回のみ)

```bash
sudo apt-get install -y ffmpeg fonts-noto-cjk   # 動画の合成と字幕の日本語フォント
pnpm e2e:install                                 # Playwright の Chromium
docker run -d --rm -p 50021:50021 --name voicevox voicevox/voicevox_engine:cpu-ubuntu20.04-0.21.1
```

## 作り直す手順

```bash
pnpm db:up && pnpm db:seed && pnpm db:seed:demo   # ローカルの練習データ (架空の名前)
pnpm manual:prepare                               # 撮影用に整える (ローカル DB 以外では動かない)
pnpm dev                                          # 別のターミナルで
pnpm manual:video            # 動画をすべて作る (番号で絞る: pnpm manual:video 03 05)
pnpm manual:capture          # 画面写真 (動画の後に撮ると、通知書や回答が入った状態になる)
pnpm manual:pdf              # PDF
pnpm manual:publish          # アプリの「使い方」画面に入れる (public/manual/ と src/lib/manual/catalog.ts を更新)
```

- 出力: `dist/manual/CrossShift_管理者マニュアル.pdf`、`CrossShift_職員マニュアル.pdf`、`dist/manual/videos/*.mp4`（字幕の `.srt` は `dist/manual/.work/<動画名>/captions.srt`）
- アプリでは管理者メニューの「使い方」と、職員ホームの「使い方（説明動画）」で見られる。`manual:publish` の後にコミットしてデプロイすると反映される。管理者向け（`public/manual/admin/`）は管理者だけが開ける。
- 動画の内容（話す文と操作）は `scripts/manual/scenarios/` にある。文を直して作り直すだけで、字幕・音声・画面の長さがそろう。
- 動画を撮り直す前には毎回 `pnpm manual:prepare` を実行する（「はじめてのログイン」で変えたパスワードなどを元に戻すため）。

## 注意

- **本番の画面・本番のデータでは撮らない。** `scripts/manual/` はローカル (localhost) 以外では止まるようにしてある。
- 音声は VOICEVOX（冥鳴ひまり）。動画の最後に「VOICEVOX:冥鳴ひまり」のクレジットを入れている。配布するときもクレジットを消さないこと。
- 梨花の旧画面 (`/admin/shifts/rika`) は実在の職員名が入っているため、マニュアル・動画に入れていない。
