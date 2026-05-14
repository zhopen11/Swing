import { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
  PanResponder,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Bell, Search } from 'lucide-react-native';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  return `${weekday} ${monthDay}`;
}
import { useLiveGames } from '@/features/live/hooks/useLiveGames';
import { useFilteredGames } from '@/features/live/hooks/useFilteredGames';
import { FilterPills } from '@/features/live/components/FilterPills';
import { LiveGameCard } from '@/features/live/components/LiveGameCard';
import { UpcomingGameCard } from '@/features/live/components/UpcomingGameCard';
import { useLiveFilterStore } from '@/lib/store/live-filter';
import { useNotificationsStore } from '@/lib/store/notifications';
import { requestAndRegisterPushToken } from '@/lib/push/permissions';
import { ApiError } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { type as t, fonts } from '@/lib/theme/typography';
import { space } from '@/lib/theme/spacing';
import type { GameDetail } from '@/lib/api/types';
import { getSimReplay } from '@/lib/api/sim';
import { useSimStore, useSimGames } from '@/lib/store/sim';

// ─── Date navigator ──────────────────────────────────────────────────────────

function DateNavigator({
  date,
  today,
  onPrev,
  onNext,
}: {
  date: string;
  today: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const canGoNext = date < addDays(today, 3);
  const label = date === today ? 'TODAY' : formatDateLabel(date);
  return (
    <View style={dnStyles.container}>
      <Pressable onPress={onPrev} hitSlop={12} style={dnStyles.btn}>
        <ChevronLeft size={16} color={colors.textSecondary} />
      </Pressable>
      <Text style={dnStyles.label}>{label}</Text>
      <Pressable
        onPress={canGoNext ? onNext : undefined}
        hitSlop={12}
        style={dnStyles.btn}>
        <ChevronRight size={16} color={canGoNext ? colors.textSecondary : colors.border} />
      </Pressable>
    </View>
  );
}

const dnStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    gap: space.base,
  },
  btn: { padding: 4 },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    minWidth: 90,
    textAlign: 'center',
  },
});

// ─── Pulsing live dot ────────────────────────────────────────────────────────

function PulsingDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.liveDot, style]} />
  );
}

// ─── Notification permission banner ──────────────────────────────────────────

function NotificationBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <View style={bannerStyles.container}>
      <Text style={bannerStyles.text}>
        Get push alerts when momentum swings.
      </Text>
      <Pressable
        style={bannerStyles.enableBtn}
        onPress={async () => {
          await requestAndRegisterPushToken();
          onDismiss();
        }}>
        <Text style={bannerStyles.enableText}>Enable →</Text>
      </Pressable>
      <Pressable style={bannerStyles.dismissBtn} onPress={onDismiss} hitSlop={8}>
        <Text style={bannerStyles.dismissText}>✕</Text>
      </Pressable>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sky + '18',
    borderLeftWidth: 3,
    borderLeftColor: colors.sky,
    marginHorizontal: space.base,
    marginBottom: space.sm,
    borderRadius: 8,
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  text: { fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary, flex: 1 },
  enableBtn: { paddingHorizontal: space.sm },
  enableText: { fontFamily: fonts.mono, fontSize: 11, color: colors.sky, letterSpacing: 0.5 },
  dismissBtn: { padding: 4 },
  dismissText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
});

// ─── Error / empty states ─────────────────────────────────────────────────────

function ErrorState({ error }: { error: unknown }) {
  if (error instanceof ApiError) {
    if (error.type === 'FeedDown' || error.status === 503) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Data source unavailable.</Text>
          <Text style={styles.emptySubtitle}>{error.message}</Text>
        </View>
      );
    }
    if (error.type === 'NetworkError') {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Couldn't reach the data feed.</Text>
          <Text style={styles.emptySubtitle}>Pull to refresh.</Text>
        </View>
      );
    }
  }
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>Couldn't reach the data feed.</Text>
      <Text style={styles.emptySubtitle}>Pull to refresh.</Text>
    </View>
  );
}

function NoLiveGamesState() {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No games live right now.</Text>
      <Text style={styles.emptySubtitle}>Check back at tipoff.</Text>
    </View>
  );
}

function FollowingEmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No followed teams with live games.</Text>
      <Text style={styles.emptySubtitle}>Add teams in the Following tab.</Text>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      {title === 'LIVE NOW' && <PulsingDot />}
      <Text style={styles.sectionTitle}>
        {title}{count !== undefined ? ` · ${count} GAME${count !== 1 ? 'S' : ''}` : ''}
      </Text>
    </View>
  );
}

// ─── Sim banner ───────────────────────────────────────────────────────────────

function SimBanner({ label, onExit }: { label: string; onExit: () => void }) {
  return (
    <View style={simStyles.banner}>
      <Text style={simStyles.bannerText}>SIM · MAR 20</Text>
      <Text style={simStyles.bannerTime}>{label}</Text>
      <Pressable onPress={onExit} hitSlop={12} style={simStyles.bannerExit}>
        <Text style={simStyles.bannerExitText}>✕</Text>
      </Pressable>
    </View>
  );
}

const simStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.alertYellow + '22',
    borderLeftWidth: 3,
    borderLeftColor: colors.alertYellow,
    marginHorizontal: space.base,
    marginBottom: space.xs,
    borderRadius: 6,
    paddingHorizontal: space.base,
    paddingVertical: 6,
    gap: space.sm,
  },
  bannerText: { fontFamily: fonts.mono, fontSize: 10, color: colors.alertYellow, letterSpacing: 1.5 },
  bannerTime: { fontFamily: fonts.mono, fontSize: 10, color: colors.textSecondary, flex: 1 },
  bannerExit: { padding: 2 },
  bannerExitText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
});

// ─── Sim scrubber ─────────────────────────────────────────────────────────────

function SimScrubber({
  frameIndex,
  frameCount,
  currentLabel,
  onScrub,
}: {
  frameIndex: number;
  frameCount: number;
  currentLabel: string;
  onScrub: (index: number) => void;
}) {
  const trackWidth = useRef(0);
  const onScrubRef = useRef(onScrub);
  const frameCountRef = useRef(frameCount);
  useEffect(() => { onScrubRef.current = onScrub; }, [onScrub]);
  useEffect(() => { frameCountRef.current = frameCount; }, [frameCount]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (trackWidth.current === 0) return;
        const x = evt.nativeEvent.locationX;
        const clamped = Math.max(0, Math.min(x, trackWidth.current));
        onScrubRef.current(Math.round((clamped / trackWidth.current) * (frameCountRef.current - 1)));
      },
      onPanResponderMove: (evt) => {
        if (trackWidth.current === 0) return;
        const x = evt.nativeEvent.locationX;
        const clamped = Math.max(0, Math.min(x, trackWidth.current));
        onScrubRef.current(Math.round((clamped / trackWidth.current) * (frameCountRef.current - 1)));
      },
    }),
  ).current;

  const thumbPct = frameCount > 1 ? frameIndex / (frameCount - 1) : 0;

  return (
    <View style={scrubStyles.container}>
      <Text style={scrubStyles.timeLabel}>{currentLabel}</Text>
      <View style={scrubStyles.trackRow}>
        <Text style={scrubStyles.endLabel}>9:00 PM</Text>
        <View
          style={scrubStyles.track}
          onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
          {...panResponder.panHandlers}>
          <View style={scrubStyles.trackBg} pointerEvents="none" />
          <View style={[scrubStyles.fill, { width: `${thumbPct * 100}%` as any }]} />
          <View style={[scrubStyles.thumb, { left: `${thumbPct * 100}%` as any }]} />
        </View>
        <Text style={scrubStyles.endLabel}>9:30 PM</Text>
      </View>
    </View>
  );
}

const scrubStyles = StyleSheet.create({
  container: {
    paddingHorizontal: space.base,
    paddingBottom: space.base,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.navy,
  },
  timeLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.alertYellow,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  endLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textMuted, letterSpacing: 0.5 },
  track: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    position: 'absolute',
    left: 0, right: 0,
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 3,
    backgroundColor: colors.alertYellow,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.alertYellow,
    top: '50%' as any,
    marginTop: -9,
    marginLeft: -9,
  },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function LiveScreen() {
  const router = useRouter();
  const filter = useLiveFilterStore((s) => s.filter);
  const [today] = useState(getTodayET);
  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;
  const { data, error, isFetching, refetch } = useLiveGames(selectedDate, isToday);

  // Sim mode
  const simIsActive = useSimStore((s) => s.isActive);
  const simFrames = useSimStore((s) => s.frames);
  const simFrameIndex = useSimStore((s) => s.frameIndex);
  const simActivate = useSimStore((s) => s.activate);
  const simDeactivate = useSimStore((s) => s.deactivate);
  const simSetFrameIndex = useSimStore((s) => s.setFrameIndex);
  const simGames = useSimGames();

  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWordmarkTap = useCallback(() => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 800);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      if (tapTimer.current) clearTimeout(tapTimer.current);
      if (!simIsActive) {
        useSimStore.setState({ isLoading: true });
        getSimReplay()
          .then((replay) => simActivate(replay))
          .catch(() => useSimStore.setState({ isLoading: false }));
      }
    }
  }, [simIsActive, simActivate]);

  const gamesForFilter = simIsActive ? simGames : data?.games;
  const { live, upcoming, final } = useFilteredGames(gamesForFilter);
  const { bannerDismissed, permissionStatus, setBannerDismissed } = useNotificationsStore();
  const [showBanner, setShowBanner] = useState(false);

  // Show banner 2s after landing on Live tab — only if permission not yet decided
  useEffect(() => {
    if (bannerDismissed || permissionStatus === 'granted' || permissionStatus === 'denied') return;
    const timer = setTimeout(() => setShowBanner(true), 2_000);
    return () => clearTimeout(timer);
  }, [bannerDismissed, permissionStatus]);

  async function handleBannerDismiss() {
    setShowBanner(false);
    await setBannerDismissed();
  }

  const handleRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const handlePrev = useCallback(() => setSelectedDate((d) => addDays(d, -1)), []);
  const handleNext = useCallback(() => {
    setSelectedDate((d) => {
      const next = addDays(d, 1);
      return next <= addDays(today, 3) ? next : d;
    });
  }, [today]);

  const renderLiveGame = useCallback(
    ({ item }: { item: GameDetail }) => <LiveGameCard game={item} />,
    [],
  );

  const renderUpcomingGame = useCallback(
    ({ item }: { item: GameDetail }) => <UpcomingGameCard game={item} />,
    [],
  );

  const isPast = selectedDate < today;
  const isFuture = selectedDate > today;
  const hasAnyGames = live.length > 0 || upcoming.length > 0 || final.length > 0;

  const ListHeader = (
    <>
      {simIsActive && simFrames.length > 0 && (
        <SimBanner
          label={simFrames[simFrameIndex]?.label ?? ''}
          onExit={simDeactivate}
        />
      )}

      {/* Notification permission banner */}
      {showBanner && (
        <NotificationBanner onDismiss={() => void handleBannerDismiss()} />
      )}

      {/* LIVE NOW section — only on today or if games happen to be live */}
      {(isToday || live.length > 0) && (
        error ? (
          <>
            <SectionHeader title="LIVE NOW" />
            <ErrorState error={error} />
          </>
        ) : live.length > 0 ? (
          <SectionHeader title="LIVE NOW" count={live.length} />
        ) : filter === 'following' ? (
          <>
            <SectionHeader title="LIVE NOW" />
            <FollowingEmptyState />
          </>
        ) : upcoming.length === 0 ? (
          <>
            <SectionHeader title="LIVE NOW" />
            <NoLiveGamesState />
          </>
        ) : null
      )}

      {/* Empty state for non-today dates with no games at all */}
      {!isToday && !error && !hasAnyGames && data && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            {isPast ? 'No games found for this date.' : 'No games scheduled yet.'}
          </Text>
        </View>
      )}
    </>
  );

  const FinalSection = final.length > 0 ? (
    <View style={styles.upcomingSection}>
      <SectionHeader title="FINAL" count={final.length} />
      <FlatList
        data={final}
        keyExtractor={(g) => `final-${g.id}`}
        renderItem={renderLiveGame}
        scrollEnabled={false}
      />
    </View>
  ) : null;

  const UpcomingSection = upcoming.length > 0 ? (
    <View style={styles.upcomingSection}>
      <SectionHeader title="UPCOMING" />
      <FlatList
        data={upcoming}
        keyExtractor={(g) => `upcoming-${g.id}`}
        renderItem={renderUpcomingGame}
        scrollEnabled={false}
      />
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Sticky header */}
      <View style={styles.header}>
        <Pressable onPress={handleWordmarkTap}>
          <Text style={styles.wordmark}>SWING</Text>
          <Text style={styles.subtitle}>{simIsActive ? 'SIM MODE' : 'LIVE'}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.iconButton}
            onPress={() => Alert.alert('Coming soon', 'Search is coming in a future update.')}>
            <Search size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.iconButton}
            onPress={() => router.push('/(tabs)/alerts')}>
            <Bell size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Date navigator */}
      <DateNavigator
        date={selectedDate}
        today={today}
        onPrev={handlePrev}
        onNext={handleNext}
      />

      {/* Filter pills */}
      <FilterPills />

      {/* Game list */}
      <FlatList
        data={live}
        keyExtractor={(g) => g.id}
        renderItem={renderLiveGame}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          <View>
            {FinalSection}
            {UpcomingSection}
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !data}
            onRefresh={handleRefresh}
            tintColor={colors.sky}
          />
        }
      />

      {simIsActive && simFrames.length > 0 && (
        <SimScrubber
          frameIndex={simFrameIndex}
          frameCount={simFrames.length}
          currentLabel={simFrames[simFrameIndex]?.label ?? ''}
          onScrub={simSetFrameIndex}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: space.base,
    paddingTop: space.sm,
    paddingBottom: 4,
  },
  wordmark: {
    fontFamily: fonts.bebas,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  headerActions: { flexDirection: 'row', gap: space.sm, paddingTop: 4 },
  iconButton: { padding: space.xs },

  // List
  listContent: { paddingBottom: space['2xl'] },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.base,
    paddingTop: space.base,
    paddingBottom: space.sm,
  },
  sectionTitle: {
    ...t.label,
    color: colors.textTertiary,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.liveDot,
  },

  // Upcoming
  upcomingSection: { marginTop: space.base },

  // Empty / error states
  emptyContainer: {
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    ...t.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  emptySubtitle: {
    ...t.bodySm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
