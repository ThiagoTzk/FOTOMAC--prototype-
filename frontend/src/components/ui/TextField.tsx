import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { colors, fonts, radius } from '@/theme/tokens';

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  secure?: boolean;
  onSubmitEditing?: () => void;
} & Pick<TextInputProps, 'autoComplete' | 'keyboardType' | 'textContentType' | 'autoFocus'>;

/** "Campo" from the Figma auth templates: label, input, optional show-password and error. */
export function TextField({ label, value, onChangeText, placeholder, error, secure = false,
                            onSubmitEditing, ...inputProps }: Props) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label} *</Text>
      <View style={[styles.input, focused && styles.inputFocused, !!error && styles.inputError]}>
        <TextInput
          style={styles.text}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={secure && !visible}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          aria-invalid={!!error}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          {...inputProps}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
            onPress={() => setVisible((v) => !v)}
            style={styles.eye}>
            <Icon name="eye" size={18} />
          </Pressable>
        )}
      </View>
      {!!error && (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="circle-alert" size={13} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 7, width: '100%' },
  label: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  input: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingLeft: 13,
    paddingRight: 10,
  },
  inputFocused: { borderColor: colors.primary },
  // Figma: error state uses a 2 px red border.
  inputError: { borderWidth: 2, borderColor: colors.danger, paddingLeft: 12, paddingRight: 9 },
  text: {
    flex: 1,
    height: '100%',
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
    // The focus ring is drawn by the container border; the browser's default outline would double it.
    outlineStyle: 'none',
  } as object,
  eye: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { flex: 1, fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.danger },
});
