"use client";

/**
 * 結いナビの画面は react-router-dom 向けに書かれている。画面のコードをそのまま使うため、
 * 使っている部品 (Link / NavLink / Navigate / useNavigate / useParams) だけを Next.js で置き換える。
 * 結いナビ内のパス ("/president/home" など) は CrossShift では "/growth" の下に置く。
 */
import NextLink from "next/link";
import { useParams as useNextParams, usePathname, useRouter } from "next/navigation";
import { useEffect, type ComponentProps, type ReactNode } from "react";

export const YUI_BASE = "/growth";

export function toHref(to: string): string {
  if (!to.startsWith("/")) return to;
  if (to === YUI_BASE || to.startsWith(`${YUI_BASE}/`)) return to;
  return `${YUI_BASE}${to}`;
}

type LinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & { to: string };

export function Link({ to, ...rest }: LinkProps) {
  return <NextLink href={toHref(to)} {...rest} />;
}

type NavLinkProps = Omit<ComponentProps<typeof NextLink>, "href" | "className"> & {
  to: string;
  className?: string | ((s: { isActive: boolean }) => string);
  children?: ReactNode;
};

export function NavLink({ to, className, ...rest }: NavLinkProps) {
  const pathname = usePathname();
  const href = toHref(to);
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  const cls = typeof className === "function" ? className({ isActive }) : className;
  return (
    <NextLink href={href} className={cls} aria-current={isActive ? "page" : undefined} {...rest} />
  );
}

export function useNavigate() {
  const router = useRouter();
  return (to: string | number, opts?: { replace?: boolean }) => {
    if (typeof to === "number") {
      router.back();
      return;
    }
    if (opts?.replace) router.replace(toHref(to));
    else router.push(toHref(to));
  };
}

export function useParams<T extends Record<string, string | undefined>>(): Partial<T> {
  return useNextParams() as unknown as Partial<T>;
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  return null;
}
