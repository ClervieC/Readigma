import { View, Text, TouchableOpacity } from 'react-native';
import { ColorPalette } from '../theme';

const STEPS = [0.25, 0.5, 0.75, 1];

// Quarter-star precision: each star is covered by four stacked touch zones
// (25/50/75/100% width), so tapping anywhere across a star picks the
// nearest quarter-point instead of only whole/half stars. Shared by
// app/book/[id].tsx's rating/finish-review UI and the Discover "reading"
// card's own finish-and-rate prompt (app/(tabs)/index.tsx).
export default function StarRating({
  rating,
  onChange,
  colors,
}: {
  rating: number;
  onChange: (r: number) => void;
  colors: ColorPalette;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <View
          key={star}
          style={{
            width: 32,
            height: 32,
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {STEPS.map((step) => (
            <TouchableOpacity
              key={step}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${step * 100}%` as any,
                zIndex: 1,
              }}
              onPress={() => onChange(star - 1 + step)}
            />
          ))}
          <Text
            style={{
              fontSize: 24,
              zIndex: 0,
              color:
                rating >= star
                  ? colors.purple
                  : rating >= star - 0.5
                    ? colors.lavender
                    : colors.gray,
            }}
          >
            {rating >= star ? '★' : rating >= star - 0.5 ? '⯨' : '☆'}
          </Text>
        </View>
      ))}
      <Text style={{ fontSize: 13, color: colors.gray, marginLeft: 8 }}>
        {rating > 0 ? rating.toFixed(2) : '—'}
      </Text>
    </View>
  );
}
