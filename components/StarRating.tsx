import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, PanResponder, GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ColorPalette } from '../theme';

const STAR_SIZE = 32;
const GAP = 4;
const UNIT = STAR_SIZE + GAP;
// Tips touch close to the edges of the 24x24 box (unlike the ★ font glyph,
// which has enough side-bearing margin that a 75%-width clip still shows
// what looks like a full star, and a 25% clip barely shows anything).
const STAR_PATH = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

function clampToQuarter(value: number) {
  return Math.min(5, Math.max(0, Math.round(value * 4) / 4));
}

// locationX is relative to the row View that owns the responder, and RN keeps
// reporting it relative to that same view for the whole gesture — no manual
// measure()/pageX bookkeeping needed to turn a touch or drag position into a
// star value.
function ratingFromX(x: number): number {
  const total = STAR_SIZE * 5 + GAP * 4;
  const clamped = Math.min(Math.max(x, 0), total);
  const starIndex = Math.min(4, Math.floor(clamped / UNIT));
  const withinUnit = clamped - starIndex * UNIT;
  const fraction = Math.min(1, withinUnit / STAR_SIZE);
  return clampToQuarter(starIndex + fraction);
}

// Quarter-star precision, settable three ways: tap/drag anywhere across the
// row (fingers rarely land on exact pixels, so drag re-evaluates the rating
// on every move instead of only on release), or type the number directly.
// Shared by app/book/[id].tsx's rating/finish-review UI and the Discover
// "reading" card's own finish-and-rate prompt (app/(tabs)/index.tsx).
export default function StarRating({
  rating,
  onChange,
  colors,
}: {
  rating: number;
  onChange: (r: number) => void;
  colors: ColorPalette;
}) {
  const [editingText, setEditingText] = useState<string | null>(null);

  const handleTouch = (evt: GestureResponderEvent) => {
    onChange(ratingFromX(evt.nativeEvent.locationX));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: handleTouch,
      onPanResponderMove: handleTouch,
    })
  ).current;

  const commitText = () => {
    const parsed = parseFloat((editingText ?? '').replace(',', '.'));
    if (!Number.isNaN(parsed)) onChange(clampToQuarter(parsed));
    setEditingText(null);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View
        style={{ flexDirection: 'row', gap: GAP }}
        {...panResponder.panHandlers}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const fraction = Math.max(0, Math.min(1, rating - (star - 1)));
          return (
            <View key={star} style={{ width: STAR_SIZE, height: STAR_SIZE }}>
              <Svg
                width={STAR_SIZE}
                height={STAR_SIZE}
                viewBox="0 0 24 24"
                style={{ position: 'absolute', left: 0, top: 0 }}
              >
                <Path d={STAR_PATH} fill="none" stroke={colors.gray} strokeWidth={1.5} />
              </Svg>
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: `${fraction * 100}%` as any,
                  height: STAR_SIZE,
                  overflow: 'hidden',
                }}
              >
                <Svg width={STAR_SIZE} height={STAR_SIZE} viewBox="0 0 24 24">
                  <Path d={STAR_PATH} fill={colors.purple} />
                </Svg>
              </View>
            </View>
          );
        })}
      </View>
      {editingText !== null ? (
        <TextInput
          autoFocus
          keyboardType="decimal-pad"
          value={editingText}
          onChangeText={setEditingText}
          onBlur={commitText}
          onSubmitEditing={commitText}
          selectTextOnFocus
          style={{
            fontSize: 13,
            color: colors.gray,
            marginLeft: 8,
            minWidth: 32,
            padding: 0,
          }}
        />
      ) : (
        <TouchableOpacity onPress={() => setEditingText(rating > 0 ? rating.toFixed(2) : '')}>
          <Text style={{ fontSize: 13, color: colors.gray, marginLeft: 8 }}>
            {rating > 0 ? rating.toFixed(2) : '—'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
