// SVGs exported unedited from the Figma "Componentes" page (Icon/*, 16 px).
// UiIcon uses them as a mask, so their stroke color is irrelevant.
import alert from '../assets/icons/alert.svg';
import check from '../assets/icons/check.svg';
import close from '../assets/icons/close.svg';
import info from '../assets/icons/info.svg';
import warning from '../assets/icons/warning.svg';
import folder from '../assets/icons/folder.svg';
import settings from '../assets/icons/settings.svg';
import stepBack from '../assets/icons/step-back.svg';
import stepForward from '../assets/icons/step-forward.svg';
import restart from '../assets/icons/restart.svg';
import runAll from '../assets/icons/run-all.svg';
import plus from '../assets/icons/plus.svg';
import minus from '../assets/icons/minus.svg';
import download from '../assets/icons/download.svg';

export const iconUrls = {
    alert,
    warning,
    check,
    info,
    close,
    folder,
    settings,
    'step-back': stepBack,
    'step-forward': stepForward,
    restart,
    'run-all': runAll,
    plus,
    minus,
    download,
} as const;

export type IconName = keyof typeof iconUrls;
