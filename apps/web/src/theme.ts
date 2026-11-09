import type { ThemeConfig } from 'antd';

/** Design tokens — single source for colors used in TS (charts, status chips, grid). */
export const colors = {
  navy: '#0f172a',
  navy2: '#16213a',
  ink: '#0f172a',
  ink2: '#475569',
  ink3: '#94a3b8',
  line: '#e6e9ef',
  canvas: '#f5f7fa',
  ok: '#16a34a',
  okBg: '#dcfce7',
  warn: '#d97706',
  warnBg: '#fef3c7',
  bad: '#dc2626',
  badBg: '#fee2e2',
  info: '#2563eb',
  infoBg: '#dbeafe',
  neutral: '#64748b',
  neutralBg: '#f1f5f9',
  violet: '#7c3aed',
  violetBg: '#ede9fe',
  // categorical chart series (validated palette, fixed order)
  series1: '#2a78d6',
  series2: '#eb6834',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
};

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#1d4ed8',
    colorSuccess: colors.ok,
    colorWarning: colors.warn,
    colorError: colors.bad,
    colorInfo: colors.info,
    colorText: colors.ink,
    colorTextSecondary: colors.ink2,
    colorBorder: '#dfe3ea',
    colorBorderSecondary: colors.line,
    colorBgLayout: colors.canvas,
    borderRadius: 8,
    borderRadiusLG: 12,
    fontFamily: "Inter, system-ui, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    controlHeight: 36,
    boxShadowSecondary: '0 6px 24px rgba(15,23,42,.10)',
  },
  components: {
    Layout: { siderBg: colors.navy, headerBg: '#ffffff', bodyBg: colors.canvas, headerHeight: 60, headerPadding: '0 24px' },
    Menu: { darkItemBg: 'transparent', darkItemColor: '#a7b1c2', darkItemHoverColor: '#ffffff', darkItemSelectedBg: '#1e2b47', itemMarginInline: 10 },
    Table: { headerBg: '#f8fafc', rowHoverBg: '#f8fafc', cellPaddingBlock: 12, borderColor: colors.line },
    Card: { headerFontSize: 14 },
    Button: { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none' },
    Tag: { defaultBg: colors.neutralBg },
    Drawer: { paddingLG: 20 },
  },
};
