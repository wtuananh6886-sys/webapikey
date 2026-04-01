import { userPackages } from "@/lib/mock-data";
import { getSupabaseAdminClient, isSupabaseEnabled } from "@/lib/supabase";

const DEFAULT_TITLE = "AOV Pro Activation";

export type ActivationUiBranding = { uiTitle: string; uiSubtitle: string | null };

export async function getActivationBrandingByPackageToken(packageToken: string): Promise<ActivationUiBranding | null> {
  const tok = packageToken.trim();
  if (tok.length < 8) return null;

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("user_packages")
        .select("activation_ui_title, activation_ui_subtitle")
        .eq("token", tok)
        .maybeSingle();
      if (error || !data) return null;
      const title = typeof data.activation_ui_title === "string" && data.activation_ui_title.trim().length > 0
        ? data.activation_ui_title.trim()
        : DEFAULT_TITLE;
      const sub =
        typeof data.activation_ui_subtitle === "string" && data.activation_ui_subtitle.trim().length > 0
          ? data.activation_ui_subtitle.trim()
          : null;
      return { uiTitle: title, uiSubtitle: sub };
    }
  }

  const pkg = userPackages.find((p) => p.token === tok);
  if (!pkg) return null;
  const title = pkg.activationUiTitle?.trim() || DEFAULT_TITLE;
  const sub = pkg.activationUiSubtitle?.trim() || null;
  return { uiTitle: title, uiSubtitle: sub };
}

export async function getActivationBrandingByPackageName(packageName: string): Promise<ActivationUiBranding> {
  const name = packageName.trim();
  if (!name) return { uiTitle: DEFAULT_TITLE, uiSubtitle: null };

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const { data } = await supabase
        .from("user_packages")
        .select("activation_ui_title, activation_ui_subtitle")
        .eq("name", name)
        .maybeSingle();
      if (data) {
        const title =
          typeof data.activation_ui_title === "string" && data.activation_ui_title.trim().length > 0
            ? data.activation_ui_title.trim()
            : DEFAULT_TITLE;
        const sub =
          typeof data.activation_ui_subtitle === "string" && data.activation_ui_subtitle.trim().length > 0
            ? data.activation_ui_subtitle.trim()
            : null;
        return { uiTitle: title, uiSubtitle: sub };
      }
    }
  }

  const pkg = userPackages.find((p) => p.name === name);
  if (!pkg) return { uiTitle: DEFAULT_TITLE, uiSubtitle: null };
  return {
    uiTitle: pkg.activationUiTitle?.trim() || DEFAULT_TITLE,
    uiSubtitle: pkg.activationUiSubtitle?.trim() || null,
  };
}
