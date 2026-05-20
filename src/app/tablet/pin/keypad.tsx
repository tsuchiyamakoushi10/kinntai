"use client";

import { useState } from "react";

/**
 * 4 桁の数字パッド。共有タブレットを横向きで持つ前提なので、ボタンを大きく
 * 配置する。最後の 1 桁を入力した瞬間に form を自動 submit して、操作ステップを
 * 「数字 4 回タップだけ」に揃える。
 */
export function PinKeypad({ action, eid }: { action: (fd: FormData) => void; eid: string }) {
  const [pin, setPin] = useState<string>("");

  function append(d: string): void {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      // 自動送信。React 19 の form action 経由なので普通に formData を組んで渡す。
      const fd = new FormData();
      fd.set("eid", eid);
      fd.set("pin", next);
      action(fd);
    }
  }

  function backspace(): void {
    setPin((p) => p.slice(0, -1));
  }

  function clear(): void {
    setPin("");
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <ol aria-label="入力済みの桁" className="flex gap-3">
        {[0, 1, 2, 3].map((i) => {
          const filled = i < pin.length;
          return (
            <li
              key={i}
              className={
                filled
                  ? "size-5 rounded-full bg-slate-900"
                  : "size-5 rounded-full border-2 border-slate-300 bg-white"
              }
            />
          );
        })}
      </ol>

      <div className="grid w-full grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <KeyButton key={d} onClick={() => append(d)}>
            {d}
          </KeyButton>
        ))}
        <KeyButton onClick={clear} variant="secondary">
          クリア
        </KeyButton>
        <KeyButton onClick={() => append("0")}>0</KeyButton>
        <KeyButton onClick={backspace} variant="secondary">
          ←
        </KeyButton>
      </div>
    </div>
  );
}

function KeyButton({
  children,
  onClick,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  const base =
    "h-20 rounded-2xl text-3xl font-bold shadow-sm transition active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  const cls =
    variant === "primary"
      ? `${base} bg-white text-slate-900 hover:bg-slate-50`
      : `${base} bg-slate-200 text-slate-700 hover:bg-slate-300`;
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
