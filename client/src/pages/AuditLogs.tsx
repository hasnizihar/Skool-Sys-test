import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Table,
  Badge,
  Button,
  Group,
  Stack,
  TextInput,
  Select,
  Modal,
  Text,
  Paper,
  SimpleGrid,
  Box,
  ScrollArea,
  Code,
  Title
} from '@mantine/core';
import {
  History,
  Search,
  ShieldCheck,
  Eye,
  Copy,
  Check,
  RefreshCw
} from 'lucide-react';
import { api } from '../api/client';
import {
  SectionHeader,
  EmptyState,
  LoadingState,
  showAppNotification
} from '../ui/mantine';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [filterAction, setFilterAction] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getAuditLogs(filterAction || undefined);
      setLogs(res.logs || []);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      showAppNotification.error('Audit Log Error', err.message || 'Failed to load system audit trail.');
    } finally {
      setLoading(false);
    }
  }, [filterAction]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Filter logs by search query (username, entity_type, entity_id, ip)
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase().trim();
    return logs.filter((log) => {
      const matchUser = log.username?.toLowerCase().includes(q);
      const matchAction = log.action?.toLowerCase().includes(q);
      const matchEntity = log.entity_type?.toLowerCase().includes(q) || String(log.entity_id || '').includes(q);
      const matchIp = log.ip_address?.toLowerCase().includes(q);
      return matchUser || matchAction || matchEntity || matchIp;
    });
  }, [logs, searchQuery]);

  // Quick stats
  const metrics = useMemo(() => {
    const total = logs.length;
    const logins = logs.filter((l) => l.action?.includes('LOGIN')).length;
    const updates = logs.filter((l) => l.action?.includes('UPDATE') || l.action?.includes('SUBMIT') || l.action?.includes('CREATE')).length;
    const security = logs.filter((l) => l.action?.includes('DELETE') || l.action?.includes('BACKUP') || l.action?.includes('RESTORE')).length;
    return { total, logins, updates, security };
  }, [logs]);

  const getActionBadge = (action: string) => {
    if (action.includes('LOGIN')) {
      return <Badge color="refinedBlue" variant="light" size="sm">{action}</Badge>;
    }
    if (action.includes('SUBMIT') || action.includes('CREATE')) {
      return <Badge color="statusGreen" variant="light" size="sm">{action}</Badge>;
    }
    if (action.includes('DELETE') || action.includes('RESTORE')) {
      return <Badge color="statusRed" variant="light" size="sm">{action}</Badge>;
    }
    if (action.includes('UPDATE')) {
      return <Badge color="statusAmber" variant="light" size="sm">{action}</Badge>;
    }
    return <Badge color="slate" variant="light" size="sm">{action}</Badge>;
  };

  const handleCopyJson = () => {
    if (!selectedLog) return;
    try {
      let content = selectedLog.details;
      try {
        content = JSON.stringify(JSON.parse(selectedLog.details), null, 2);
      } catch {
        // use raw if unparseable
      }
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showAppNotification.success('Copied', 'Raw event payload copied to clipboard.');
    } catch {
      showAppNotification.error('Copy Failed', 'Unable to copy payload to clipboard.');
    }
  };

  return (
    <Stack gap="lg">
      {/* 1. Header & Quick Metrics */}
      <Paper p="lg" radius="md" withBorder bg="white">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Box>
            <Group gap="xs" mb={4}>
              <ShieldCheck size={22} style={{ color: 'var(--mantine-color-refinedBlue-6, #2563eb)' }} />
              <Title order={3} fw={700} c="slate.8">
                System Audit Trail & Security Logs
              </Title>
            </Group>
            <Text size="sm" c="dimmed">
              Immutable, tamper-evident chronological ledger tracking pupil records, attendance commits, marks alterations, and privileged administration events.
            </Text>
          </Box>

          <Button
            variant="default"
            size="sm"
            leftSection={<RefreshCw size={14} className={loading ? 'spin' : ''} />}
            onClick={() => loadLogs()}
            disabled={loading}
          >
            Refresh Logs
          </Button>
        </Group>

        {/* 4 Summary Metric Cards */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mt="lg">
          <Paper p="sm" radius="md" withBorder bg="slate.0">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Recorded Events
            </Text>
            <Text size="xl" fw={700} c="refinedBlue.8" mt={2}>
              {metrics.total}
            </Text>
          </Paper>

          <Paper p="sm" radius="md" withBorder bg="slate.0">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              User Logins
            </Text>
            <Text size="xl" fw={700} c="refinedBlue.6" mt={2}>
              {metrics.logins}
            </Text>
          </Paper>

          <Paper p="sm" radius="md" withBorder bg="slate.0">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Data Modifications
            </Text>
            <Text size="xl" fw={700} c="statusGreen.7" mt={2}>
              {metrics.updates}
            </Text>
          </Paper>

          <Paper p="sm" radius="md" withBorder bg="slate.0">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Security & Lifecycle
            </Text>
            <Text size="xl" fw={700} c="statusAmber.8" mt={2}>
              {metrics.security}
            </Text>
          </Paper>
        </SimpleGrid>
      </Paper>

      {/* 2. Main Audit Table Card */}
      <Card radius="md" withBorder p={0} bg="white">
        <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-slate-2, #e2e8f0)' }}>
          <Group justify="space-between" wrap="wrap" gap="md">
            <SectionHeader
              title="Audit Event Directory"
              description="Trace user identity, operational actions, timestamp, IP origin, and raw change snapshots."
              badge={<Badge size="sm" variant="light" color="refinedBlue">{filteredLogs.length} Events</Badge>}
            />

            {/* Filter Controls */}
            <Group gap="sm" wrap="wrap">
              <TextInput
                placeholder="Search user, entity, IP..."
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="sm"
                style={{ width: 220 }}
              />

              <Select
                placeholder="Filter by Action"
                value={filterAction}
                onChange={(val) => setFilterAction(val || '')}
                data={[
                  { value: '', label: 'All Actions' },
                  { value: 'USER_LOGIN', label: 'User Logins' },
                  { value: 'STUDENT_CREATE', label: 'Student Admissions' },
                  { value: 'STUDENT_UPDATE', label: 'Student Updates' },
                  { value: 'ATTENDANCE_SUBMIT', label: 'Attendance Submissions' },
                  { value: 'MARKS_SUBMIT', label: 'Marks Entries' },
                  { value: 'BACKUP_EXPORT', label: 'Backup Exports' },
                  { value: 'BACKUP_RESTORE', label: 'Backup Restores' }
                ]}
                clearable
                size="sm"
                style={{ width: 220 }}
              />
            </Group>
          </Group>
        </Box>

        {loading ? (
          <Box p="xl">
            <LoadingState message="Fetching system audit records..." />
          </Box>
        ) : filteredLogs.length === 0 ? (
          <Box p="xl">
            <EmptyState
              icon={<History size={36} />}
              title="No Audit Records Found"
              description={searchQuery || filterAction ? "No audit events match your active filters. Try resetting the action filter or query." : "No audit trail events have been logged yet."}
              action={
                searchQuery || filterAction ? (
                  <Button variant="default" size="sm" onClick={() => { setSearchQuery(''); setFilterAction(''); }}>
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          </Box>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead bg="slate.0">
                <Table.Tr>
                  <Table.Th style={{ width: 170 }}>Timestamp</Table.Th>
                  <Table.Th style={{ width: 160 }}>User Account</Table.Th>
                  <Table.Th style={{ width: 180 }}>Action Performed</Table.Th>
                  <Table.Th>Target Entity</Table.Th>
                  <Table.Th style={{ width: 130 }}>IP Origin</Table.Th>
                  <Table.Th style={{ textAlign: 'right', width: 130 }}>Payload</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredLogs.map((log) => (
                  <Table.Tr key={log.id}>
                    <Table.Td>
                      <Text size="xs" c="slate.7" ff="monospace">
                        {log.timestamp}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Box
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: 'var(--mantine-color-refinedBlue-1, #dbeafe)',
                            color: 'var(--mantine-color-refinedBlue-8, #1e40af)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}
                        >
                          {log.username?.charAt(0)?.toUpperCase() || 'U'}
                        </Box>
                        <Text size="sm" fw={600} c="slate.8">
                          {log.username}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {getActionBadge(log.action)}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        <Code c="slate.7" style={{ fontSize: '0.75rem' }}>
                          {log.entity_type || 'SYSTEM'}
                        </Code>
                        {log.entity_id && (
                          <Badge size="xs" variant="outline" color="slate">
                            #{log.entity_id}
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" ff="monospace">
                        {log.ip_address || '127.0.0.1'}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Button
                        variant="default"
                        size="xs"
                        leftSection={<Eye size={12} />}
                        onClick={() => setSelectedLog(log)}
                      >
                        Inspect
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      {/* 3. Event Detail Modal */}
      <Modal
        opened={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={
          <Group gap="xs">
            <ShieldCheck size={18} style={{ color: 'var(--mantine-color-refinedBlue-6, #2563eb)' }} />
            <Text fw={700} size="md" c="slate.8">
              Audit Event Snapshot #{selectedLog?.id}
            </Text>
          </Group>
        }
        size="lg"
        radius="md"
      >
        {selectedLog && (
          <Stack gap="md">
            {/* Metadata Summary Grid */}
            <SimpleGrid cols={2} spacing="sm">
              <Paper p="xs" radius="sm" withBorder bg="slate.0">
                <Text size="xs" c="dimmed" fw={600}>ACTION</Text>
                <Box mt={4}>{getActionBadge(selectedLog.action)}</Box>
              </Paper>

              <Paper p="xs" radius="sm" withBorder bg="slate.0">
                <Text size="xs" c="dimmed" fw={600}>USER ACCOUNT</Text>
                <Text size="sm" fw={600} c="slate.8" mt={4}>
                  {selectedLog.username}
                </Text>
              </Paper>

              <Paper p="xs" radius="sm" withBorder bg="slate.0">
                <Text size="xs" c="dimmed" fw={600}>RECORDED TIMESTAMP</Text>
                <Text size="xs" c="slate.7" ff="monospace" mt={4}>
                  {selectedLog.timestamp}
                </Text>
              </Paper>

              <Paper p="xs" radius="sm" withBorder bg="slate.0">
                <Text size="xs" c="dimmed" fw={600}>TARGET ENTITY</Text>
                <Text size="xs" fw={600} c="slate.8" mt={4}>
                  {selectedLog.entity_type} {selectedLog.entity_id ? `(#${selectedLog.entity_id})` : ''}
                </Text>
              </Paper>
            </SimpleGrid>

            {/* Payload Data */}
            <Box>
              <Group justify="space-between" mb={6}>
                <Text size="xs" fw={600} c="slate.7">
                  RAW EVENT DATA PAYLOAD (JSON):
                </Text>
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  onClick={handleCopyJson}
                >
                  {copied ? 'Copied!' : 'Copy JSON'}
                </Button>
              </Group>

              <ScrollArea.Autosize mah={320} type="always">
                <Paper
                  p="sm"
                  radius="sm"
                  withBorder
                  bg="slate.0"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: '0.8rem',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}
                >
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedLog.details), null, 2);
                    } catch {
                      return selectedLog.details || 'No payload data recorded.';
                    }
                  })()}
                </Paper>
              </ScrollArea.Autosize>
            </Box>

            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
};

export default AuditLogs;
