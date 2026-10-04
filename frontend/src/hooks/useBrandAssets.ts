import isotipoOnLight from '../assets/isotipo-watermark-light.png'
import isotipoOnDark from '../assets/isotipo-watermark.png'
import logoOnLight from '../assets/logo-intelligent-nutrition-light.png'
import logoOnDark from '../assets/logo-intelligent-nutrition.png'

import { useTheme } from './useTheme'

export function useBrandAssets() {
  const { theme } = useTheme()
  return theme === 'light'
    ? { logo: logoOnLight, isotipo: isotipoOnLight }
    : { logo: logoOnDark, isotipo: isotipoOnDark }
}
