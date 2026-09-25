import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Modal, Platform, Pressable, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View
} from 'react-native';
import { DEFAULT_RULES, tileLabel } from '../../packages/game-core/index.js';
import { connectGameSocket, GameSocket } from './src/gameSocket';

const C = { ink: '#F6EEDB', muted: '#A8BDB5', green: '#0C493D', deep: '#061E1A', card: '#103B34', gold: '#E8B85C', red: '#DB675D', white: '#FFFDF6' };
const defaultUrl = process.env.EXPO_PUBLIC_SERVER_URL
  || (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');
const avatars = ['🀄', '🐯', '🦊', '🐼', '🦁', '🐲'];

function Button({ title, onPress, kind = 'gold', disabled = false, small = false }: any) {
  const kindStyle = kind === 'red' ? s.button_red : kind === 'ghost' ? s.button_ghost : s.button_gold;
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, kindStyle, small && s.buttonSmall, (pressed || disabled) && s.buttonDim]}>
    <Text style={[s.buttonText, kind === 'ghost' && s.buttonTextGhost]}>{title}</Text>
  </Pressable>;
}

function Tile({ tile, selected, onPress, mini = false, back = false }: any) {
  if (back) return <View style={[s.tile, s.tileBack, mini && s.tileMini]}><Text style={s.tileBackText}>晋</Text></View>;
  const label = tileLabel(tile);
  const honor = tile >= 27;
  return <Pressable onPress={onPress} style={[s.tile, mini && s.tileMini, selected && s.tileSelected]}>
    <Text style={[s.tileText, mini && s.tileTextMini, honor && s.tileHonor]}>{label}</Text>
  </Pressable>;
}

function SwitchRow({ label, value, onPress, description }: any) {
  return <Pressable onPress={onPress} style={s.switchRow}>
    <View style={{ flex: 1 }}><Text style={s.switchLabel}>{label}</Text>{description && <Text style={s.switchDesc}>{description}</Text>}</View>
    <View style={[s.switch, value && s.switchOn]}><View style={[s.knob, value && s.knobOn]} /></View>
  </Pressable>;
}

export default function App() {
  const socketRef = useRef<GameSocket | null>(null);
  const playerId = useRef(`p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);
  const roomCode = useRef('');
  const [screen, setScreen] = useState<'home' | 'create' | 'room'>('home');
  const [name, setName] = useState(`牌友${Math.floor(10 + Math.random() * 90)}`);
  const [avatar, setAvatar] = useState(avatars[0]);
  const [serverUrl, setServerUrl] = useState(defaultUrl);
  const [joinCode, setJoinCode] = useState('');
  const [state, setState] = useState<any>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [declare, setDeclare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<any>({ ...DEFAULT_RULES });

  const connect = () => {
    socketRef.current?.disconnect();
    const socket = connectGameSocket(serverUrl.trim());
    socketRef.current = socket;
    socket.on('state', (next) => { setState(next); setScreen('room'); setSelected(null); setDeclare(false); });
    socket.on('connect_error', () => setBusy(false));
    return socket;
  };

  useEffect(() => () => { socketRef.current?.disconnect(); }, []);
  const emit = (event: string, payload: any = {}) => new Promise<any>((resolve) => {
    const socket = socketRef.current;
    if (!socket) return resolve({ ok: false, error: '尚未连接服务器' });
    socket.emit(event, payload, (result: any) => {
      if (!result?.ok) Alert.alert('操作未完成', result?.error || '网络异常');
      resolve(result);
    });
  });

  const enter = (mode: 'create' | 'join') => {
    if (!name.trim()) return Alert.alert('请先填写昵称');
    if (mode === 'join' && !/^\d{6}$/.test(joinCode)) return Alert.alert('请输入 6 位房间号');
    setBusy(true); const socket = connect();
    socket.enter(mode, {
      name: name.trim(), avatar, code: joinCode, rules, playerId: playerId.current
    }, (result: any) => {
      setBusy(false);
      if (!result?.ok) Alert.alert('无法进入房间', result?.error || '请检查服务器地址');
      else { roomCode.current = result.code; playerId.current = result.playerId; }
    });
  };

  if (screen === 'home') return <SafeAreaView style={s.page}><StatusBar barStyle="light-content" />
    <ScrollView contentContainerStyle={s.home} keyboardShouldPersistTaps="handled">
      <View style={s.brandMark}><Text style={s.brandTile}>晋</Text></View>
      <Text style={s.title}>晋麻·扣点点</Text><Text style={s.subtitle}>山河作桌，好友成局</Text>
      <View style={s.card}>
        <Text style={s.label}>你的称呼</Text>
        <TextInput value={name} onChangeText={setName} maxLength={10} placeholder="输入昵称" placeholderTextColor="#718B82" style={s.input} />
        <Text style={s.label}>选个头像</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
          {avatars.map((a) => <Pressable key={a} onPress={() => setAvatar(a)} style={[s.avatarChoice, avatar === a && s.avatarActive]}><Text style={s.avatarEmoji}>{a}</Text></Pressable>)}
        </ScrollView>
        <Text style={s.label}>联网服务器</Text>
        <TextInput value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none" style={s.input} />
        <Button title="创建好友房" onPress={() => setScreen('create')} />
        <View style={s.joinRow}>
          <TextInput value={joinCode} onChangeText={setJoinCode} keyboardType="number-pad" maxLength={6} placeholder="输入 6 位房间号" placeholderTextColor="#718B82" style={[s.input, { flex: 1, marginBottom: 0 }]} />
          <Button title={busy ? '连接中' : '加入'} disabled={busy} small onPress={() => enter('join')} />
        </View>
      </View>
      <Text style={s.footnote}>不含充值、金币交易与随机匹配 · 仅供亲友娱乐</Text>
    </ScrollView>
  </SafeAreaView>;

  if (screen === 'create') return <SafeAreaView style={s.page}>
    <View style={s.topbar}><Pressable onPress={() => setScreen('home')}><Text style={s.back}>‹ 返回</Text></Pressable><Text style={s.topTitle}>创建牌局</Text><View style={{ width: 48 }} /></View>
    <ScrollView contentContainerStyle={s.config}>
      <Text style={s.sectionTitle}>局数</Text><View style={s.segment}>{[4, 8, 12].map((n) => <Pressable key={n} onPress={() => setRules({ ...rules, rounds: n })} style={[s.segmentItem, rules.rounds === n && s.segmentActive]}><Text style={[s.segmentText, rules.rounds === n && s.segmentTextActive]}>{n} 局</Text></Pressable>)}</View>
      <Text style={s.sectionTitle}>扣点点规则</Text>
      <View style={s.card}>
        <SwitchRow label="带风牌" description="136 张牌；关闭后使用 108 张" value={rules.withWinds} onPress={() => setRules({ ...rules, withWinds: !rules.withWinds })} />
        <SwitchRow label="带庄多五分" value={rules.dealerBonus} onPress={() => setRules({ ...rules, dealerBonus: !rules.dealerBonus })} />
        <SwitchRow label="留七墩" description="牌墙剩 14 张时荒庄" value={rules.reserveSevenStacks} onPress={() => setRules({ ...rules, reserveSevenStacks: !rules.reserveSevenStacks })} />
        <SwitchRow label="七对 / 豪华七对" value={rules.sevenPairs} onPress={() => setRules({ ...rules, sevenPairs: !rules.sevenPairs })} />
        <SwitchRow label="清一色加番" value={rules.pureSuit} onPress={() => setRules({ ...rules, pureSuit: !rules.pureSuit })} />
        <SwitchRow label="一条龙加番" value={rules.straight} onPress={() => setRules({ ...rules, straight: !rules.straight })} />
      </View>
      <View style={s.ruleNote}><Text style={s.ruleNoteTitle}>固定规则</Text><Text style={s.ruleNoteText}>可碰、可杠、不可吃；必须报听。1–2 点不可胡，3–5 点仅可自摸，6 点以上可点炮。</Text></View>
      <Button title={busy ? '正在创建…' : '创建房间'} disabled={busy} onPress={() => enter('create')} />
    </ScrollView>
  </SafeAreaView>;

  return <GameRoom state={state} emit={emit} selected={selected} setSelected={setSelected} declare={declare} setDeclare={setDeclare} />;
}

function GameRoom({ state, emit, selected, setSelected, declare, setDeclare }: any) {
  if (!state) return <SafeAreaView style={s.page}><Text style={s.loading}>正在进入牌桌…</Text></SafeAreaView>;
  const me = state.players[state.me];
  const isOwner = state.me === 0;
  if (state.status === 'waiting') return <SafeAreaView style={s.page}>
    <View style={s.roomHeader}><View><Text style={s.roomEyebrow}>好友房</Text><Text style={s.roomCode}>{state.code}</Text></View><View style={s.roundPill}><Text style={s.roundPillText}>{state.rules.rounds} 局 · {state.rules.withWinds ? '带风' : '不带风'}</Text></View></View>
    <Text style={s.shareHint}>把 6 位房间号告诉牌友</Text>
    <View style={s.seatGrid}>{[0,1,2,3].map((seat) => {
      const p = state.players[seat]; return <View key={seat} style={[s.seatCard, p && s.seatFilled]}>{p ? <><Text style={s.seatAvatar}>{p.avatar}</Text><Text style={s.seatName}>{p.name}{seat === 0 ? ' · 房主' : ''}</Text><Text style={[s.readyText, p.ready && s.readyOn]}>{seat === 0 ? '已入座' : p.ready ? '已准备' : '等待准备'}</Text></> : <><Text style={s.emptySeat}>＋</Text><Text style={s.emptyText}>等待牌友</Text></>}</View>;
    })}</View>
    <View style={s.bottomAction}>{isOwner ? <Button title="开始对局" disabled={state.players.length !== 4 || !state.players.slice(1).every((p: any) => p.ready)} onPress={() => emit('start')} /> : <Button title={me.ready ? '取消准备' : '准备'} kind={me.ready ? 'ghost' : 'gold'} onPress={() => emit('toggleReady')} />}</View>
  </SafeAreaView>;

  const myTurn = state.status === 'playing' && state.pending?.kind === 'turn' && state.turn === state.me;
  const canClaim = state.pending?.kind === 'claim' && state.pending.actions?.length > 0;
  const canSelfHu = myTurn && me.declared;
  const others = [1,2,3].map((offset) => state.players[(state.me + offset) % 4]);
  const submitDiscard = () => selected != null && emit('discard', { tile: selected, declare });
  return <SafeAreaView style={s.tablePage}>
    <View style={s.gameHeader}><Text style={s.gameLogo}>晋麻</Text><Text style={s.gameMeta}>房间 {state.code}　{state.round}/{state.rules.rounds} 局　余 {state.wallCount} 张</Text></View>
    <View style={s.opponents}>
      {others.map((p: any) => <View key={p.seat} style={[s.opponent, state.turn === p.seat && s.activeSeat]}><Text style={s.opAvatar}>{p.avatar}</Text><Text numberOfLines={1} style={s.opName}>{p.name}</Text><Text style={s.opScore}>{p.score >= 0 ? '+' : ''}{p.score}</Text><Text style={s.opCount}>{p.declared ? '已报听' : `${p.handCount} 张`}</Text></View>)}
    </View>
    <View style={s.tableCenter}>
      <View style={s.windBadge}><Text style={s.windText}>{state.turn === state.me ? '轮到你' : '思考中'}</Text></View>
      <ScrollView contentContainerStyle={s.discardGrid} style={{ width: '100%' }}>
        {state.discards.map((d: any, i: number) => <Tile key={`${i}-${d.tile}`} tile={d.tile} mini />)}
      </ScrollView>
    </View>
    <View style={s.meBar}><View><Text style={s.meName}>{me.avatar} {me.name} {me.declared && '· 已报听'}</Text><Text style={s.meScore}>积分 {me.score >= 0 ? '+' : ''}{me.score}</Text></View>{myTurn && <Text style={s.turnHint}>请选择一张牌</Text>}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hand}>
      {me.hand?.map((tile: number, i: number) => <Tile key={`${tile}-${i}`} tile={tile} selected={selected === tile} onPress={() => myTurn && setSelected(tile)} />)}
    </ScrollView>
    <View style={s.actionTray}>
      {myTurn && !me.declared && <Pressable onPress={() => setDeclare(!declare)} style={[s.declareBox, declare && s.declareOn]}><Text style={s.declareText}>{declare ? '✓ ' : ''}报听并出牌</Text></Pressable>}
      {myTurn && <Button title="出牌" small disabled={selected == null} onPress={submitDiscard} />}
      {canSelfHu && <Button title="自摸" small kind="red" onPress={() => emit('selfHu')} />}
      {myTurn && selected != null && me.hand.filter((t: number) => t === selected).length === 4 && <Button title="暗杠" small kind="ghost" onPress={() => emit('selfGang', { tile: selected })} />}
      {canClaim && state.pending.actions.map((a: string) => <Button key={a} title={({ hu: '胡', gang: '杠', peng: '碰' } as Record<string, string>)[a]} small kind={a === 'hu' ? 'red' : 'gold'} onPress={() => emit('claim', { action: a })} />)}
      {canClaim && <Button title="过" small kind="ghost" onPress={() => emit('claim', { action: 'pass' })} />}
    </View>
    <ResultModal state={state} isOwner={isOwner} emit={emit} />
  </SafeAreaView>;
}

function ResultModal({ state, isOwner, emit }: any) {
  const visible = state.status === 'roundEnd' || state.status === 'finished';
  const result = state.lastResult;
  const winner = result?.winner != null ? state.players[result.winner] : null;
  return <Modal visible={visible} transparent animationType="slide"><View style={s.modalShade}><View style={s.resultCard}>
    <Text style={s.resultKicker}>{state.status === 'finished' ? '整场结束' : `第 ${state.round} 局`}</Text>
    <Text style={s.resultTitle}>{result?.type === '荒庄' ? '荒庄' : `${winner?.name || ''} · ${result?.type || ''}`}</Text>
    {result?.patterns && <Text style={s.patterns}>{result.patterns.join(' · ')}　每家基准 {result.pointsPerPayer} 分</Text>}
    <View style={s.scoreList}>{state.players.map((p: any, i: number) => <View key={p.id} style={s.scoreRow}><Text style={s.scoreName}>{p.avatar} {p.name}</Text><Text style={[s.delta, (result?.deltas?.[i] || 0) >= 0 ? s.positive : s.negative]}>{(result?.deltas?.[i] || 0) >= 0 ? '+' : ''}{result?.deltas?.[i] || 0}</Text><Text style={s.total}>总分 {p.score}</Text></View>)}</View>
    {state.status === 'finished' ? <Text style={s.waitOwner}>本场牌局已结束</Text> : isOwner ? <Button title="下一局" onPress={() => emit('nextRound')} /> : <Text style={s.waitOwner}>等待房主开启下一局…</Text>}
  </View></View></Modal>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.deep }, home: { padding: 24, paddingTop: 48, alignItems: 'center' },
  brandMark: { width: 72, height: 72, borderRadius: 20, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '3deg' }], shadowColor: '#000', shadowOpacity: .3, shadowRadius: 18 }, brandTile: { fontSize: 40, fontWeight: '900', color: C.deep },
  title: { color: C.ink, fontSize: 34, fontWeight: '900', marginTop: 18, letterSpacing: 2 }, subtitle: { color: C.muted, marginTop: 7, marginBottom: 30, fontSize: 15, letterSpacing: 4 },
  card: { width: '100%', backgroundColor: C.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#1A584C' }, label: { color: C.muted, fontSize: 12, marginBottom: 8, letterSpacing: 1 },
  input: { height: 50, borderRadius: 14, paddingHorizontal: 15, color: C.ink, backgroundColor: '#092C26', borderWidth: 1, borderColor: '#1B5A4E', marginBottom: 18, fontSize: 16 },
  avatarChoice: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#092C26', justifyContent: 'center', alignItems: 'center', marginRight: 9, borderWidth: 1, borderColor: '#1B5A4E' }, avatarActive: { borderColor: C.gold, backgroundColor: '#264C3C' }, avatarEmoji: { fontSize: 26 },
  button: { minHeight: 50, paddingHorizontal: 21, borderRadius: 15, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, button_gold: { backgroundColor: C.gold }, button_red: { backgroundColor: C.red }, button_ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#5D7B71' }, buttonSmall: { minHeight: 43, minWidth: 68, marginLeft: 8, marginTop: 0 }, buttonDim: { opacity: .42 }, buttonText: { color: C.deep, fontWeight: '900', fontSize: 16 }, buttonTextGhost: { color: C.ink },
  joinRow: { flexDirection: 'row', marginTop: 15, alignItems: 'center' }, footnote: { color: '#668078', fontSize: 11, marginTop: 18 },
  topbar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }, back: { color: C.gold, fontSize: 16 }, topTitle: { color: C.ink, fontSize: 18, fontWeight: '800' }, config: { padding: 20, paddingBottom: 50 }, sectionTitle: { color: C.ink, fontSize: 18, fontWeight: '800', marginBottom: 12, marginTop: 10 },
  segment: { flexDirection: 'row', backgroundColor: '#092C26', borderRadius: 15, padding: 4, marginBottom: 22 }, segmentItem: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12 }, segmentActive: { backgroundColor: C.gold }, segmentText: { color: C.muted, fontWeight: '700' }, segmentTextActive: { color: C.deep },
  switchRow: { minHeight: 61, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2B5C53' }, switchLabel: { color: C.ink, fontSize: 15, fontWeight: '700' }, switchDesc: { color: C.muted, fontSize: 11, marginTop: 3 }, switch: { width: 46, height: 27, borderRadius: 20, padding: 3, backgroundColor: '#557069' }, switchOn: { backgroundColor: C.gold }, knob: { width: 21, height: 21, borderRadius: 11, backgroundColor: C.white }, knobOn: { marginLeft: 19 },
  ruleNote: { backgroundColor: '#132D29', borderLeftWidth: 3, borderLeftColor: C.gold, padding: 15, marginVertical: 18, borderRadius: 8 }, ruleNoteTitle: { color: C.gold, fontWeight: '800', marginBottom: 5 }, ruleNoteText: { color: C.muted, lineHeight: 20 }, loading: { color: C.ink, margin: 'auto' },
  roomHeader: { padding: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, roomEyebrow: { color: C.muted, fontSize: 12 }, roomCode: { color: C.ink, fontSize: 36, fontWeight: '900', letterSpacing: 5 }, roundPill: { backgroundColor: '#163E37', padding: 10, borderRadius: 20 }, roundPillText: { color: C.gold, fontWeight: '700' }, shareHint: { color: C.muted, textAlign: 'center', marginBottom: 18 },
  seatGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16 }, seatCard: { width: '46%', margin: '2%', height: 155, borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: '#31574F', justifyContent: 'center', alignItems: 'center' }, seatFilled: { backgroundColor: C.card, borderStyle: 'solid' }, seatAvatar: { fontSize: 38 }, seatName: { color: C.ink, fontWeight: '800', marginTop: 9 }, readyText: { color: '#788E87', fontSize: 12, marginTop: 5 }, readyOn: { color: C.gold }, emptySeat: { color: '#55766D', fontSize: 35 }, emptyText: { color: '#55766D', fontSize: 12 }, bottomAction: { marginTop: 'auto', padding: 24, paddingBottom: 35 },
  tablePage: { flex: 1, backgroundColor: '#073B32' }, gameHeader: { height: 46, backgroundColor: '#062A24', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }, gameLogo: { color: C.gold, fontWeight: '900', fontSize: 16 }, gameMeta: { color: C.muted, fontSize: 11, marginLeft: 'auto' },
  opponents: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 }, opponent: { width: '30%', alignItems: 'center', padding: 6, borderRadius: 13, borderWidth: 1, borderColor: 'transparent' }, activeSeat: { borderColor: C.gold, backgroundColor: '#145246' }, opAvatar: { fontSize: 25 }, opName: { color: C.ink, fontSize: 11, fontWeight: '700', maxWidth: 90 }, opScore: { color: C.gold, fontSize: 12, fontWeight: '800' }, opCount: { color: C.muted, fontSize: 9 },
  tableCenter: { flex: 1, marginHorizontal: 12, borderRadius: 28, backgroundColor: '#0B493D', borderWidth: 1, borderColor: '#276C5D', alignItems: 'center', padding: 10 }, windBadge: { backgroundColor: '#07382F', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 15, marginBottom: 6 }, windText: { color: C.gold, fontSize: 11, fontWeight: '800' }, discardGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  tile: { width: 40, height: 58, borderRadius: 6, marginHorizontal: 2, backgroundColor: C.white, borderBottomWidth: 5, borderBottomColor: '#C9BEA7', justifyContent: 'center', alignItems: 'center' }, tileSelected: { transform: [{ translateY: -9 }], borderColor: C.gold, borderWidth: 2 }, tileText: { color: '#173E87', fontWeight: '900', fontSize: 16 }, tileHonor: { color: '#BC312E' }, tileMini: { width: 25, height: 34, borderRadius: 4, margin: 2, borderBottomWidth: 3 }, tileTextMini: { fontSize: 10 }, tileBack: { backgroundColor: '#146957', borderColor: C.white, borderWidth: 2 }, tileBackText: { color: C.gold, fontWeight: '900' },
  meBar: { paddingHorizontal: 16, paddingTop: 7, flexDirection: 'row', justifyContent: 'space-between' }, meName: { color: C.ink, fontWeight: '800' }, meScore: { color: C.gold, fontSize: 11 }, turnHint: { color: C.gold, fontSize: 12 }, hand: { paddingHorizontal: 8, paddingTop: 13, paddingBottom: 4, alignItems: 'flex-end' }, actionTray: { height: 66, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 10, backgroundColor: '#062A24' }, declareBox: { marginRight: 'auto', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#69827A' }, declareOn: { borderColor: C.gold, backgroundColor: '#204A3D' }, declareText: { color: C.ink, fontSize: 11, fontWeight: '700' },
  modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000A' }, resultCard: { backgroundColor: C.deep, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, borderTopWidth: 1, borderColor: '#2A6458' }, resultKicker: { color: C.gold, fontSize: 12, letterSpacing: 2 }, resultTitle: { color: C.ink, fontSize: 28, fontWeight: '900', marginTop: 5 }, patterns: { color: C.muted, marginTop: 6 }, scoreList: { marginVertical: 18 }, scoreRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2B5149' }, scoreName: { color: C.ink, flex: 1, fontWeight: '700' }, delta: { width: 55, fontWeight: '900', fontSize: 17 }, positive: { color: C.gold }, negative: { color: C.red }, total: { color: C.muted, width: 75, textAlign: 'right', fontSize: 12 }, waitOwner: { color: C.muted, textAlign: 'center', padding: 15 }
});
