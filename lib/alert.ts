import i18n from './i18n';
import { showAlert, AlertButton } from './alertStore';

// Same signature RN's own Alert.alert has always had, so none of this app's
// ~90 call sites needed to change — only what happens under the hood did.
// Renders through components/AlertHost.tsx (a themed in-app modal, mounted
// once in app/_layout.tsx) on every platform instead of the OS/browser's own
// dialog chrome, which used to mean this silently no-oped on web entirely
// (see react-native-web's Alert.alert — `static alert() {}`).
export function alert(title: string, message?: string, buttons?: AlertButton[]) {
  showAlert({
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: i18n.t('common.ok') }],
  });
}
