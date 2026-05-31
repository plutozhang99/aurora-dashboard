import { useMemo } from 'react';
import { theme } from 'antd';
import type { ConfigProviderProps } from 'antd';
import { createStyles } from 'antd-style';

const useStyles = createStyles(({ css, cssVar }) => {
  const illustrationBorder = {
    border: `${cssVar.lineWidth} solid ${cssVar.colorBorder}`,
  };

  const illustrationBox = {
    ...illustrationBorder,
    boxShadow: `4px 4px 0 ${cssVar.colorBorder}`,
  };

  return {
    illustrationBorder,
    illustrationBox,
    buttonRoot: css({
      ...illustrationBox,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    }),
    modalContainer: css({
      ...illustrationBox,
    }),
    tooltipRoot: css({
      padding: cssVar.padding,
    }),
    popupBox: css({
      ...illustrationBox,
      borderRadius: cssVar.borderRadiusLG,
      backgroundColor: cssVar.colorBgContainer,
    }),
    progressRail: css({
      border: `${cssVar.lineWidth} solid ${cssVar.colorBorder}`,
      boxShadow: `2px 2px 0 ${cssVar.colorBorder}`,
    }),
    progressTrack: css({
      border: 'none',
    }),
    inputNumberActions: css({
      width: 12,
    }),
  };
});

// Light vs dark palette. The brutalist look reuses one "ink" color for borders
// AND the hard 4px shadows; in dark mode the ink goes light (warm cream) so the
// inverted theme keeps the same illustrated identity. The antd-style boxes pull
// colorBorder from the token, so setting `ink` here adapts them automatically.
const PALETTE = {
  light: {
    colorText: '#2C2C2C',
    ink: '#2C2C2C', // borders + hard shadows
    colorBgBase: '#FFF9F0',
    colorBgContainer: '#FFFFFF',
    cardBg: '#FFF0F6',
    colorError: '#FA5252',
    tooltipBg: 'rgba(100, 100, 100, 0.95)',
  },
  dark: {
    colorText: '#F3ECE0',
    ink: '#E8DCC6',
    colorBgBase: '#1C1916',
    colorBgContainer: '#2A251F',
    cardBg: '#34272E',
    colorError: '#FF6B6B',
    tooltipBg: 'rgba(20, 18, 16, 0.96)',
  },
} as const;

const useIllustrationTheme = ({ reduceMotion, dark = false }: { reduceMotion?: boolean; dark?: boolean } = {}) => {
  const { styles } = useStyles();

  return useMemo<ConfigProviderProps>(
    () => {
      const p = dark ? PALETTE.dark : PALETTE.light;
      return {
      theme: {
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorText: p.colorText,
          colorPrimary: '#52C41A',
          colorSuccess: '#51CF66',
          colorWarning: '#FFD93D',
          colorError: p.colorError,
          colorInfo: '#4DABF7',
          colorBorder: p.ink,
          colorBorderSecondary: p.ink,
          lineWidth: 3,
          lineWidthBold: 3,
          borderRadius: 12,
          borderRadiusLG: 16,
          borderRadiusSM: 8,
          controlHeight: 40,
          controlHeightSM: 34,
          controlHeightLG: 48,
          fontSize: 15,
          fontWeightStrong: 600,
          colorBgBase: p.colorBgBase,
          colorBgContainer: p.colorBgContainer,
          motion: !reduceMotion,
        },
        components: {
          Button: {
            primaryShadow: 'none',
            dangerShadow: 'none',
            defaultShadow: 'none',
            fontWeight: 600,
          },
          Modal: {
            boxShadow: 'none',
          },
          Card: {
            boxShadow: `4px 4px 0 ${p.ink}`,
            colorBgContainer: p.cardBg,
          },
          Tooltip: {
            colorBorder: p.ink,
            colorBgSpotlight: p.tooltipBg,
            borderRadius: 8,
          },
          Select: {
            optionSelectedBg: 'transparent',
          },
          Slider: {
            dotBorderColor: '#237804',
            dotActiveBorderColor: '#237804',
            colorPrimaryBorder: '#237804',
            colorPrimaryBorderHover: '#237804',
          },
        },
      },
      button: {
        classNames: {
          root: styles.buttonRoot,
        },
      },
      modal: {
        classNames: {
          container: styles.modalContainer,
        },
      },
      alert: {
        className: styles.illustrationBorder,
      },
      colorPicker: {
        arrow: false,
        classNames: {
          root: styles.illustrationBox,
        },
      },
      popover: {
        classNames: {
          container: styles.illustrationBox,
        },
      },
      tooltip: {
        arrow: false,
        classNames: {
          root: styles.tooltipRoot,
          container: styles.illustrationBox,
        },
      },
      dropdown: {
        classNames: {
          root: styles.popupBox,
        },
      },
      select: {
        classNames: {
          root: styles.illustrationBox,
          popup: {
            root: styles.popupBox,
          },
        },
      },
      input: {
        classNames: {
          root: styles.illustrationBox,
        },
      },
      inputNumber: {
        classNames: {
          root: styles.illustrationBox,
          actions: styles.inputNumberActions,
        },
      },
      progress: {
        classNames: {
          rail: styles.progressRail,
          track: styles.progressTrack,
        },
        styles: {
          rail: {
            height: 16,
          },
          track: {
            height: 10,
          },
        },
      },
      };
    },
    [reduceMotion, dark, styles],
  );
};

export default useIllustrationTheme;
