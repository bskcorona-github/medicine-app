# おくすりリマインダー

忘れっぽい人のための薬のリマインダーアプリです。設定した時間になると「ずんだもん」の声で知らせてくれます。

## 主な機能

- **お薬の登録**: 薬の名前と服用時間を設定
- **毎日リマインド**: 毎日同じ時間に通知
- **通知機能**:
  - **スマホバックグラウンド通知**: スマホでアプリを開いていなくても通知が届きます
  - 画面上の通知
  - 音声通知（ずんだもんの「おくすりのじかんだ」ボイス）
- **リマインダー**: 服用し忘れたときに再通知
- **服用記録**: 服用したかどうかの記録
- **日別リセット**: 日付が変わると自動的に記録をリセット
- **PWA 対応**: ホーム画面に追加してアプリのように使用可能

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
2. **音声通知**: 通知時に「ずんだもん」の音声が流れます。
3. **画面上の通知**: アプリ画面上に通知が表示されます。
4. **バックグラウンド通知**: Service Worker を使用して、アプリが閉じていても通知を表示します。

### スマホでの通知の受け取り方

最も確実に通知を受け取るために、以下の手順を行ってください：

1. **PWA としてインストール**（強く推奨）:

   - アプリ画面に表示される「アプリをインストール」ボタンをタップ
   - または、ブラウザのメニューから「ホーム画面に追加」を選択

2. **通知の許可**:

   - 初回起動時に通知の許可を求められたら「許可」をタップ
   - 後から許可する場合は、ブラウザの設定から通知を有効にしてください

3. **省電力設定の確認**:
   - バッテリー最適化の対象から外すことで、バックグラウンドでも確実に通知が届きます
   - iOS: 設定 → バッテリー → バッテリー使用状況で Safari のバックグラウンド使用を許可
   - Android: 設定 → アプリ →Chrome→ バッテリー → 制限なし を選択

### 注意事項

- 通知音を鳴らすには、PWA としてインストールするか、一度はアプリを開いておく必要があります
- スマホの場合、ブラウザを完全に終了しても Service Worker によって通知が届きます
- 通知が届かない場合は、アプリを再度開いてリロードしてみてください

## 使用技術

- Next.js
- TypeScript
- Tailwind CSS
- Web Notifications API
- Service Worker
- PWA (Progressive Web App)
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
