import { useCallback, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAlerts } from '@/features/alerts/hooks/useAlerts';
import { AlertFilterPills } from '@/features/alerts/components/AlertFilterPills';
import { LiveAlertCard } from '@/features/alerts/components/LiveAlertCard';
import { FinishedAlertCard } from '@/features/alerts/components/FinishedAlertCard';
import { useAlertFilterStore } from '@/lib/store/alert-filter';
import { colors } from '@/lib/theme/colors';
import { type as t, fonts } from '@/lib/theme/typography';
import { space } from '@/lib/theme/spacing';
import type { Alert, AlertType, League } from '@/lib/api/types';
import { useSimStore, useSimAlerts } from '@/lib/store/sim';

function applyFilters(
  alerts: Alert[],
  typeFilter: AlertType | 'all',
  sportFilter: League | 'all',
): Alert[] {
  return alerts.filter((a) => {
    const typeOk = typeFilter === 'all' || a.type === typeFilter;
    return typeOk;
  });
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        {title} · {count}
      </Text>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export default function AlertsScreen() {
  const { typeFilter, sportFilter, setTypeFilter } = useAlertFilterStore();
  const simIsActive = useSimStore((s) => s.isActive);
  const simAlerts = useSimAlerts();
  const { data: apiAlerts = [], isFetching, refetch } = useAlerts();
  const allAlerts = simIsActive ? simAlerts : apiAlerts;

  const filtered = useMemo(
    () => applyFilters(allAlerts, typeFilter, sportFilter),
    [allAlerts, typeFilter, sportFilter],
  );

  const liveAlerts = useMemo(() => filtered.filter((a) => !a.result), [filtered]);
  const finishedAlerts = useMemo(() => filtered.filter((a) => !!a.result), [filtered]);

  const handleRefresh = useCallback(() => { void refetch(); }, [refetch]);

  const noAlertsToday = allAlerts.length === 0;
  const noFilteredResults = filtered.length === 0 && !noAlertsToday;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.wordmark}>SWING</Text>
          <Text style={styles.subtitle}>{simIsActive ? 'SIM ALERTS' : 'ALERTS'}</Text>
        </View>
      </View>

      {/* Filter pills */}
      <AlertFilterPills alerts={allAlerts} />

      {/* Content */}
      <FlatList
        data={[]}
        keyExtractor={() => ''}
        renderItem={null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && allAlerts.length === 0}
            onRefresh={handleRefresh}
            tintColor={colors.sky}
          />
        }
        ListHeaderComponent={
          <>
            {noAlertsToday ? (
              <EmptyState message="No alerts fired today. The score and the run of play agree — for now." />
            ) : noFilteredResults ? (
              <EmptyState
                message={
                  typeFilter !== 'all'
                    ? `No ${typeFilter.replace('-', ' ')} alerts today.`
                    : 'No alerts match the current filter.'
                }
              />
            ) : (
              <>
                {/* LIVE section */}
                {liveAlerts.length > 0 && (
                  <>
                    <SectionHeader title="LIVE" count={liveAlerts.length} />
                    {liveAlerts.map((a) => (
                      <View key={a.id} pointerEvents={simIsActive ? 'none' : 'auto'}>
                        <LiveAlertCard alert={a} />
                      </View>
                    ))}
                  </>
                )}

                {/* EARLIER TODAY section */}
                {finishedAlerts.length > 0 && (
                  <>
                    <SectionHeader title="EARLIER TODAY" count={finishedAlerts.length} />
                    {finishedAlerts.map((a) => (
                      <View key={a.id} pointerEvents={simIsActive ? 'none' : 'auto'}>
                        <FinishedAlertCard alert={a} />
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
            <View style={{ height: space['3xl'] }} />
          </>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy },
  header: {
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
  content: { paddingBottom: space.base },
  sectionHeader: {
    paddingHorizontal: space.base,
    paddingTop: space.base,
    paddingBottom: space.sm,
  },
  sectionTitle: { ...t.label, color: colors.textTertiary },
  empty: {
    paddingHorizontal: space.xl,
    paddingVertical: space['2xl'],
    alignItems: 'center',
  },
  emptyText: {
    ...t.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
