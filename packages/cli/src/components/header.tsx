import { useTheme } from "../providers/theme";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function Header() {
  const { colors } = useTheme();
  // Attempt to load small SVG for display in docs or future terminals that support images.
  let logo = "";
  try {
    const p = join(__dirname, "../assets/yuktiio-primary-logo.svg");
    logo = readFileSync(p, "utf8");
  } catch {
    // ignore
  }

  return (
    <box justifyContent="center" alignItems="center">
      <box flexDirection="row" justifyContent="center" gap={0.5} alignItems="center">
        <box width={2} height={1} backgroundColor={colors.primary} />
        <ascii-font font="tiny" text="Night" color={colors.primary} />
        <ascii-font font="tiny" text="Code" color="gray" />
      </box>
    </box>
  );
};
