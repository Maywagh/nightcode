import { useTheme } from "../providers/theme";

export function Header() {
  const { colors } = useTheme();

  return (
    <box justifyContent="center" alignItems="center">
      <box flexDirection="row" justifyContent="center" gap={0.5} alignItems="center">
        {/* ASCII banner showing brand name; colors use theme primary and planMode for contrast */}
        <ascii-font font="tiny" text="YUKTI" color="white" />
        <ascii-font font="tiny" text="IO" color={colors.planMode} />
      </box>
    </box>
  );
};
