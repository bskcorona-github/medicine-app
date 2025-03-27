# おくすりリマインダー

忘れっぽい人のための薬のリマインダーアプリです。設定した時間になると「ずんだもん」の声で知らせてくれます。

## 主な機能

- **お薬の登録**: 薬の名前と服用時間を設定
- **毎日リマインド**: 毎日同じ時間に通知
- **通知機能**:
  - スマホの通知
  - 画面上の通知
  - 音声通知（ずんだもんの「おくすりのじかんだ」ボイス）
- **リマインダー**: 服用し忘れたときに再通知
- **服用記録**: 服用したかどうかの記録
- **日別リセット**: 日付が変わると自動的に記録をリセット

## セットアップ方法

1. リポジトリをクローン

```
git clone https://github.com/bskcorona-github/medicine-app.git
```

2. 依存関係をインストール

```
cd medicine-app
npm install
```

3. 開発サーバーを起動

```
npm run dev
```

4. ブラウザで確認

```
http://localhost:3000
```

## 通知設定について

このアプリでは以下の通知方法を使用しています：

1. **ブラウザ通知**: Web ブラウザの通知機能を使用。初回起動時に通知の許可を求められます。
2. **音声通知**: 通知時に音声が流れます。
3. **画面上の通知**: アプリ画面上に通知が表示されます。

### 注意事項

- モバイルデバイスでの通知を有効にするには、ブラウザの通知設定をオンにしてください。
- iOS の場合、ホーム画面に追加すると PWA として動作し、バックグラウンドでも通知を受け取れます。
- スマートフォンで使用する場合は、省電力設定でバックグラウンド実行を許可してください。

## 使用技術

- Next.js
- TypeScript
- Tailwind CSS
- Web Notifications API
- localStorage

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
