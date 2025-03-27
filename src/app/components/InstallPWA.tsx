"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface WindowWithStandalone extends Window {
  MSStream?: unknown; // MSStreamはTypeScriptの型定義に含まれていないため
  navigator: Navigator & {
    standalone?: boolean; // iOS Safariのスタンドアロンモード判定用
  };
}

export default function InstallPWA() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // インストールプロンプトを保存する
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // beforeinstallpromptイベントを保存
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    // iOSかどうかを検出
    const detectIOS = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const windowWithMS = window as WindowWithStandalone;
      return /iphone|ipad|ipod/.test(userAgent) && !windowWithMS.MSStream;
    };

    // PWAがインストール済みかどうかを検出
    const isAppInstalled = () => {
      const windowWithStandalone = window as WindowWithStandalone;
      return (
        window.matchMedia("(display-mode: standalone)").matches ||
        windowWithStandalone.navigator.standalone === true
      );
    };

    setIsIOS(detectIOS());
    setIsInstalled(isAppInstalled());

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", () => setIsInstalled(true));

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    // プロンプトを表示
    await installPrompt.prompt();

    // ユーザーの選択を待つ
    const choiceResult = await installPrompt.userChoice;

    if (choiceResult.outcome === "accepted") {
      console.log("ユーザーがインストールを承認しました");
      setInstallPrompt(null);
    } else {
      console.log("ユーザーがインストールを拒否しました");
    }
  };

  const showIOSInstallInstructions = () => {
    setShowIOSInstructions(!showIOSInstructions);
  };

  // すでにインストール済みか、インストールできない場合は何も表示しない
  if (isInstalled || (!installPrompt && !isIOS)) return null;

  return (
    <div className="fixed bottom-16 right-4 z-40 bg-white p-4 rounded-lg shadow-lg max-w-xs">
      {installPrompt && !isIOS && (
        <div>
          <h3 className="font-bold text-base mb-2">アプリをインストール</h3>
          <p className="text-sm mb-3">
            このアプリをインストールすると、通知がより確実に届きます。
          </p>
          <button
            onClick={handleInstallClick}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
          >
            インストールする
          </button>
        </div>
      )}

      {isIOS && (
        <div>
          <h3 className="font-bold text-base mb-2">
            iOSでアプリをインストール
          </h3>
          <p className="text-sm mb-2">
            iOSでは「ホーム画面に追加」から、アプリとして使用できます。
          </p>
          <button
            onClick={showIOSInstallInstructions}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
          >
            インストール方法を表示
          </button>

          {showIOSInstructions && (
            <div className="mt-3 p-3 bg-gray-100 rounded-md text-sm">
              <ol className="list-decimal list-inside space-y-2">
                <li>
                  Safariのシェアボタン
                  <span className="inline-block w-5 h-5 bg-blue-500 text-white rounded-full text-center leading-5">
                    ↑
                  </span>
                  をタップ
                </li>
                <li>「ホーム画面に追加」を選択</li>
                <li>右上の「追加」をタップ</li>
              </ol>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setInstallPrompt(null)}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
      >
        ✕
      </button>
    </div>
  );
}
