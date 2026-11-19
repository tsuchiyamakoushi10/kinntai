"use client";

import { useEffect, useState } from "react";
import { Link } from "@/yui/router";
import { UserPlus, Pencil, ArrowLeft, Mail } from "lucide-react";
import { staffStore } from "@/yui/storage";
import PageHeader from "../../components/PageHeader";
import type { Staff } from "../../types";

export default function AdminMaster() {
  const [admins, setAdmins] = useState<Staff[]>([]);

  useEffect(() => {
    setAdmins(
      staffStore
        .list()
        .filter((s) => s.role === "manager")
        .sort((a, b) => (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, "ja")),
    );
  }, []);

  return (
    <>
      <PageHeader
        title="管理者マスター"
        subtitle="各部署の管理者を登録・編集します"
        right={
          <div className="flex items-center gap-2">
            <Link
              to="/president/settings"
              className="text-ink-600 border-cream-200 hover:bg-cream-50 inline-flex items-center gap-1.5 rounded-full border bg-white px-4 py-2 text-sm font-medium transition"
            >
              <ArrowLeft className="h-4 w-4" />
              設定に戻る
            </Link>
            <Link
              to="/president/settings/admins/new"
              className="bg-warm-500 hover:bg-warm-600 shadow-soft inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white transition"
            >
              <UserPlus className="h-4 w-4" />
              管理者を追加
            </Link>
          </div>
        }
      />

      {admins.length === 0 ? (
        <div className="card text-ink-400 py-12 text-center">まだ管理者が登録されていません。</div>
      ) : (
        <div className="space-y-2">
          {admins.map((a) => (
            <Link
              key={a.id}
              to={`/president/settings/admins/${a.id}`}
              className="card hover:bg-cream-50 flex items-center gap-4 transition"
            >
              <div className="bg-warm-100 text-warm-600 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold">
                {a.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-ink-800 truncate text-base font-bold">{a.name}</span>
                  {!a.active && (
                    <span className="text-ink-400 bg-cream-100 rounded-full px-2 py-0.5 text-[10px] font-bold">
                      無効
                    </span>
                  )}
                </div>
                <div className="text-ink-400 truncate text-sm">{a.department}</div>
                {a.email && (
                  <div className="text-ink-400 mt-0.5 flex items-center gap-1 text-xs">
                    <Mail className="h-3 w-3" />
                    {a.email}
                  </div>
                )}
              </div>
              <span className="text-warm-600 inline-flex shrink-0 items-center gap-1.5 text-sm font-medium">
                <Pencil className="h-4 w-4" />
                編集
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
