import { redirect } from "next/navigation";

type LoginAliasPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginAliasPage({ searchParams }: LoginAliasPageProps) {
  const sp = await searchParams;
  const redirectParam = sp.redirect;
  const redirectTo =
    typeof redirectParam === "string" && redirectParam.trim()
      ? `?redirect=${encodeURIComponent(redirectParam)}`
      : "";
  redirect(`/login${redirectTo}`);
}
