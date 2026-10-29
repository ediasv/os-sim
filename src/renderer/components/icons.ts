// SVGs exported unedited from the Figma "Componentes" page (Icon/*, 16 px).
// UiIcon uses them as a mask, so their stroke color is irrelevant.
import alert from '../assets/icons/alert.svg';
import check from '../assets/icons/check.svg';
import close from '../assets/icons/close.svg';
import info from '../assets/icons/info.svg';
import warning from '../assets/icons/warning.svg';

export const iconUrls = { alert, warning, check, info, close } as const;

export type IconName = keyof typeof iconUrls;
