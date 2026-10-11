import { Platform } from 'react-native';
export const colors = {
  background: '#F7F7F0', paper: '#FFFFFF', ink: '#20372D', muted: '#6D786E',
  green: '#234C3A', greenLight: '#E6EDE2', coral: '#EF805E', border: '#DFE3D8', danger: '#B64336',
};
export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });

