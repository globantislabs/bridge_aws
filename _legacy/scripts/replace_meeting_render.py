"""Replace the MeetingRoom render section with a full-screen Google Meet style."""

PATH = '/home/z/my-project/src/components/views/meetings-view.tsx'

with open(PATH, 'r') as f:
    src = f.read()

START_MARKER = "  const pinnedTile = pinnedPeer ? videoTiles.find"
END_MARKER = "\n}\n\nfunction VideoGrid("

start_idx = src.find(START_MARKER)
if start_idx == -1:
    raise SystemExit("start marker not found")
end_idx = src.find(END_MARKER, start_idx)
if end_idx == -1:
    raise SystemExit("end marker not found")

before = src[:start_idx]
after = src[end_idx + len(END_MARKER) - 1:]

new_render = '''  const pinnedTile = pinnedPeer ? videoTiles.find((t) => t.peerId === pinnedPeer) : null

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col select-none">
      {/* ============================================================
       *  Top overlay header — minimal, fades on inactivity
       * ============================================================ */}
      <header
        className={`absolute top-0 left-0 right-0 h-12 z-30 flex items-center px-4 gap-3 bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-300 ${
          sidePanelOpen ? 'opacity-100' : 'opacity-100'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`size-2 rounded-full ${isRecording ? 'bg-red-500 live-pulse' : 'bg-emerald-400'}`} />
          <span className="text-[13px] font-medium truncate">{meeting.title}</span>
          {isRecording && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-red-500 live-pulse" />
              REC {Math.floor(recordingSecs / 60)}:{String(recordingSecs % 60).padStart(2, '0')}
            </span>
          )}
          <span className="text-[11px] text-white/50 hidden md:inline">
            · {meeting.joinCode}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-white/70 px-2 py-1 rounded-full bg-white/5">
            <Users className="size-3" />
            {participants.filter((p) => !p.leftAt).length}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/70 px-2 py-1 rounded-full bg-white/5">
            <Languages className="size-3" />
            {targetLang.toUpperCase()}
          </div>
          {meeting.e2ee && (
            <div className="flex items-center gap-1 text-[11px] text-emerald-300 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Lock className="size-3" />
              E2EE
            </div>
          )}
        </div>
      </header>

      {/* ============================================================
       *  Main video area — fills the entire viewport
       * ============================================================ */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Floating reactions layer */}
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          {floatingReactions.map((r) => (
            <div
              key={r.id}
              className="absolute bottom-32 text-4xl reaction-float"
              style={{ left: `${r.x}%` }}
            >
              {r.emoji}
            </div>
          ))}
        </div>

        {/* Pinned tile (large) */}
        {pinnedTile ? (
          <div className="flex-1 p-3 pt-14 min-h-0">
            <VideoTile tile={pinnedTile} large onUnpin={() => setPinnedPeer(null)} />
          </div>
        ) : null}

        {/* Grid of tiles — fills entire screen */}
        <div className={`flex-1 p-3 pt-14 min-h-0 ${pinnedTile ? 'hidden' : ''}`}>
          <VideoGrid tiles={videoTiles} onPin={(pid) => setPinnedPeer(pid)} />
        </div>

        {/* Pinned tile filmstrip */}
        {pinnedTile && (
          <div className="absolute left-3 right-3 bottom-24 z-20 flex gap-2 overflow-x-auto pb-1">
            {videoTiles.filter((t) => t.peerId !== pinnedPeer).map((t) => (
              <MiniTile key={t.peerId} tile={t} onClick={() => setPinnedPeer(t.peerId)} />
            ))}
          </div>
        )}

        {/* Live caption — floating, bottom-center */}
        {(activeCaption || interimCaption) && captionsEnabled && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 max-w-2xl px-4 z-20 caption-in pointer-events-none">
            <div className="bg-black/75 text-white rounded-lg px-4 py-2 text-center backdrop-blur-sm shadow-float">
              {activeCaption ? (
                <>
                  <div className="text-[10px] opacity-60 mb-0.5 uppercase tracking-wider">
                    {activeCaption.speakerName} · {activeCaption.targetLang.toUpperCase()}
                  </div>
                  <div className="text-sm md:text-base">{activeCaption.targetText}</div>
                </>
              ) : (
                <div className="text-sm opacity-60 italic">{interimCaption}</div>
              )}
            </div>
          </div>
        )}

        {/* Right side panel — toggleable drawer */}
        {sidePanelOpen && (
          <>
            {/* Mobile backdrop */}
            <div
              className="absolute inset-0 bg-black/40 z-20 md:hidden"
              onClick={() => setSidePanelOpen(false)}
            />
            <aside className="absolute right-0 top-0 bottom-0 w-full md:w-[360px] z-30 bg-slate-800 border-l border-white/10 flex flex-col shadow-2xl">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
                <div className="h-12 border-b border-white/10 flex items-center px-2 gap-0.5 shrink-0">
                  <button
                    onClick={() => setSidePanelOpen(false)}
                    className="size-8 grid place-items-center rounded hover:bg-white/5 text-white/70"
                    aria-label="Close panel"
                  >
                    <X className="size-4" />
                  </button>
                  <div className="w-px h-5 bg-white/10 mx-1" />
                  <TabsList className="grid grid-cols-5 rounded-none bg-transparent h-9 p-0 flex-1">
                    <TabsTrigger value="translate" className="rounded data-[state=active]:bg-white/10 gap-1 px-1 text-[10px] text-white/80">
                      <Languages className="size-3.5" />
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="rounded data-[state=active]:bg-white/10 gap-1 px-1 text-[10px] text-white/80">
                      <MessageSquare className="size-3.5" />
                    </TabsTrigger>
                    <TabsTrigger value="participants" className="rounded data-[state=active]:bg-white/10 gap-1 px-1 text-[10px] text-white/80 relative">
                      <Users className="size-3.5" />
                      {handRaisedQueue.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 px-1 rounded-full bg-amber-500 text-amber-950 text-[9px] font-bold">
                          {handRaisedQueue.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="polls" className="rounded data-[state=active]:bg-white/10 gap-1 px-1 text-[10px] text-white/80">
                      <BarChart3 className="size-3.5" />
                    </TabsTrigger>
                    <TabsTrigger value="whiteboard" className="rounded data-[state=active]:bg-white/10 gap-1 px-1 text-[10px] text-white/80">
                      <PenLine className="size-3.5" />
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="translate" className="flex-1 flex flex-col min-h-0 mt-0 text-white">
                  <LiveTranslationPanel
                    meetingId={meeting.id}
                    transcriptLang={meeting.transcriptLang}
                    userName={user?.name ?? 'Guest'}
                    onPersist={(entry: TranslationEntry) => {
                      fetch(`/api/meetings/${meeting.id}/transcripts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          speakerName: entry.speakerName,
                          sourceLang: entry.sourceLang,
                          sourceText: entry.sourceText,
                          targetLang: entry.targetLang,
                          targetText: entry.targetText,
                        }),
                      }).catch(() => {})
                    }}
                  />
                </TabsContent>

                <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 mt-0">
                  <ScrollArea className="flex-1 px-3">
                    <div className="py-3 space-y-2">
                      {chats.length === 0 && (
                        <div className="text-center text-xs text-white/40 py-6">
                          No messages yet. Say hello!
                        </div>
                      )}
                      {chats.map((c) => (
                        <div key={c.id} className={`flex flex-col ${c.userId === peerId ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm ${c.userId === peerId ? 'bg-primary text-white' : 'bg-white/10 text-white'}`}>
                            <div className="text-[10px] opacity-60 mb-0.5">{c.userId === peerId ? 'You' : c.displayName}</div>
                            <div>{c.message}</div>
                            {c.translated && c.translated !== c.message && (
                              <div className="text-[11px] opacity-70 italic mt-1 pt-1 border-t border-white/10">
                                → {c.translated}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="border-t border-white/10 p-2 space-y-2">
                    <label className="flex items-center gap-2 text-xs text-white/60">
                      <input
                        type="checkbox"
                        checked={chatTranslate}
                        onChange={(e) => setChatTranslate(e.target.checked)}
                        className="size-3.5"
                      />
                      Translate to {targetLang.toUpperCase()}
                    </label>
                    <div className="flex gap-1.5">
                      <Input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                        placeholder="Message…"
                        className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/40"
                      />
                      <Button size="icon" className="h-8 w-8 shrink-0" onClick={sendChat}>
                        <Send className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="participants" className="flex-1 min-h-0 mt-0 overflow-y-auto">
                  <div className="py-2">
                    {handRaisedQueue.length > 0 && (
                      <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20">
                        <div className="text-xs font-medium text-amber-300 flex items-center gap-1.5 mb-1">
                          <HandIcon className="size-3.5" /> Hands raised ({handRaisedQueue.length})
                        </div>
                        {handRaisedQueue.map((p) => (
                          <div key={p.id} className="text-xs flex items-center gap-2 py-0.5 text-white/80">
                            <Avatar className="size-5">
                              <AvatarFallback className="text-[10px] bg-white/10">{p.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            {p.displayName}
                          </div>
                        ))}
                      </div>
                    )}
                    {participants.filter((p) => !p.leftAt).map((p) => (
                      <div key={p.id} className="px-3 py-2 flex items-center gap-2 hover:bg-white/5">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-[11px] bg-white/10 text-white">{p.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate flex items-center gap-1 text-white">
                            {p.displayName}
                            {p.userId === peerId && <span className="text-[10px] text-white/40">(you)</span>}
                          </div>
                          <div className="text-[10px] text-white/40 flex items-center gap-1 capitalize">
                            {p.role === 'host' && <Crown className="size-2.5 text-amber-400" />}
                            {p.role}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {p.audioOn ? <Mic className="size-3 text-white/40" /> : <MicOff className="size-3 text-red-400" />}
                          {p.videoOn ? <Video className="size-3 text-white/40" /> : <VideoOff className="size-3 text-white/40" />}
                          {p.handRaised && <Hand className="size-3 text-amber-400" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="polls" className="flex-1 min-h-0 mt-0 overflow-y-auto">
                  <div className="p-3 space-y-3">
                    <Button size="sm" className="w-full" onClick={() => setPollDialogOpen(true)}>
                      <Plus className="size-4 mr-1" /> New poll
                    </Button>
                    {polls.length === 0 && (
                      <div className="text-center text-xs text-white/40 py-6">
                        No polls yet. Create one to gather feedback.
                      </div>
                    )}
                    {polls.map((poll) => {
                      const options: string[] = JSON.parse(poll.optionsJson)
                      const totalVotes = poll.votes.length
                      const myVotes = poll.votes.filter((v) => v.userId === peerId).map((v) => v.optionIdx)
                      return (
                        <div key={poll.id} className="rounded-lg border border-white/10 p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-sm text-white">{poll.question}</div>
                            {poll.isClosed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">Closed</span>}
                          </div>
                          <div className="space-y-1.5">
                            {options.map((opt, idx) => {
                              const count = poll.votes.filter((v) => v.optionIdx === idx).length
                              const pct = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100)
                              const voted = myVotes.includes(idx)
                              return (
                                <button
                                  key={idx}
                                  disabled={poll.isClosed}
                                  onClick={async () => {
                                    await fetch(`/api/meetings/${meeting.id}/polls`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'vote', pollId: poll.id, optionIdx: idx }),
                                    })
                                    pollPolls()
                                  }}
                                  className={`w-full text-left rounded-md border px-2.5 py-1.5 text-sm transition-colors relative overflow-hidden ${
                                    voted ? 'border-primary bg-primary/20' : 'border-white/10 hover:bg-white/5'
                                  }`}
                                >
                                  <div className="absolute inset-y-0 left-0 bg-primary/20" style={{ width: `${pct}%` }} />
                                  <div className="relative flex justify-between text-white">
                                    <span className="flex items-center gap-1.5">
                                      {voted && <Check className="size-3 text-primary" />}
                                      {opt}
                                    </span>
                                    <span className="text-xs text-white/60 tabular">{count} · {pct}%</span>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                          <div className="text-[11px] text-white/40">{totalVotes} votes</div>
                        </div>
                      )
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="whiteboard" className="flex-1 min-h-0 mt-0">
                  <Whiteboard meetingId={meeting.id} userName={user?.name ?? 'Guest'} />
                </TabsContent>
              </Tabs>
            </aside>
          </>
        )}

        {/* ============================================================
         *  Floating control bar — Google Meet style
         * ============================================================ */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2 py-1.5 rounded-2xl bg-slate-800/95 backdrop-blur-md border border-white/10 shadow-2xl">
          <ControlBtn
            active={audioOn}
            onClick={toggleAudio}
            icon={audioOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            label={audioOn ? 'Mute' : 'Unmute'}
            dark
          />
          <ControlBtn
            active={videoOn}
            onClick={toggleVideo}
            icon={videoOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
            label={videoOn ? 'Stop video' : 'Start video'}
            dark
          />
          <ControlBtn
            active={!handRaised}
            onClick={toggleHand}
            icon={<Hand className="size-5" />}
            label={handRaised ? 'Lower hand' : 'Raise hand'}
            activeClass={handRaised ? 'bg-amber-500/30 text-amber-300' : ''}
            dark
          />
          {meeting.allowScreenShare && (
            <ControlBtn
              active={!screenSharing}
              onClick={toggleScreenShare}
              icon={screenSharing ? <ScreenShareOff className="size-5" /> : <ScreenShare className="size-5" />}
              label={screenSharing ? 'Stop share' : 'Share'}
              dark
            />
          )}
          <ControlBtn
            active={captionsEnabled}
            onClick={() => {
              const next = !captionsEnabled
              setCaptionsEnabled(next)
              if (next) startCaptions()
              else { try { recognitionRef.current?.stop() } catch {} }
            }}
            icon={<Captions className="size-5" />}
            label="CC"
            activeClass={captionsEnabled ? 'bg-emerald-500/30 text-emerald-300' : ''}
            dark
          />
          {meeting.allowRecording && (
            <ControlBtn
              active={!isRecording}
              onClick={toggleRecording}
              icon={<Radio className="size-5" />}
              label={isRecording ? 'Stop' : 'Record'}
              activeClass={isRecording ? 'bg-red-500/30 text-red-300' : ''}
              dark
            />
          )}

          {/* Side-panel toggles */}
          <div className="w-px h-8 bg-white/10 mx-0.5" />
          <ControlBtn
            active={sidePanelOpen && activeTab === 'translate'}
            onClick={() => {
              if (sidePanelOpen && activeTab === 'translate') setSidePanelOpen(false)
              else { setActiveTab('translate'); setSidePanelOpen(true) }
            }}
            icon={<Languages className="size-5" />}
            label="Translate"
            activeClass="bg-white/15 text-white"
            dark
          />
          <ControlBtn
            active={sidePanelOpen && activeTab === 'chat'}
            onClick={() => {
              if (sidePanelOpen && activeTab === 'chat') setSidePanelOpen(false)
              else { setActiveTab('chat'); setSidePanelOpen(true) }
            }}
            icon={<MessageSquare className="size-5" />}
            label="Chat"
            activeClass="bg-white/15 text-white"
            dark
          />
          <ControlBtn
            active={sidePanelOpen && activeTab === 'participants'}
            onClick={() => {
              if (sidePanelOpen && activeTab === 'participants') setSidePanelOpen(false)
              else { setActiveTab('participants'); setSidePanelOpen(true) }
            }}
            icon={<Users className="size-5" />}
            label="People"
            activeClass="bg-white/15 text-white"
            dark
          />
          <ControlBtn
            active={sidePanelOpen && activeTab === 'whiteboard'}
            onClick={() => {
              if (sidePanelOpen && activeTab === 'whiteboard') setSidePanelOpen(false)
              else { setActiveTab('whiteboard'); setSidePanelOpen(true) }
            }}
            icon={<PenLine className="size-5" />}
            label="Board"
            activeClass="bg-white/15 text-white"
            dark
          />
          <ControlBtn
            active={true}
            onClick={() => setSettingsOpen(true)}
            icon={<Settings className="size-5" />}
            label="Settings"
            dark
          />

          <div className="w-px h-8 bg-white/10 mx-0.5" />
          <button
            onClick={leaveMeeting}
            className="h-11 px-5 ml-1 rounded-full bg-red-600 hover:bg-red-500 text-white text-[13px] font-medium flex items-center gap-2 transition-colors"
          >
            <PhoneOff className="size-4" />
            Leave
          </button>
        </div>

        {/* Reaction picker — bottom-right floating */}
        <div className="absolute bottom-24 right-4 z-30 flex gap-1 bg-slate-800/95 backdrop-blur-md rounded-full p-1 border border-white/10 shadow-float">
          {REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => sendReaction(e)}
              className="size-9 rounded-full grid place-items-center hover:bg-white/10 transition-colors text-xl"
              title="React"
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Settings dialog */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        targetLang={targetLang}
        setTargetLang={setTargetLang}
        autoTranslate={autoTranslate}
        setAutoTranslate={setAutoTranslate}
        captionsEnabled={captionsEnabled}
        setCaptionsEnabled={(v) => {
          setCaptionsEnabled(v)
          if (v) startCaptions()
          else { try { recognitionRef.current?.stop() } catch {} }
        }}
        langs={LANGS}
        meeting={meeting}
      />

      {/* Poll dialog */}
      <CreatePollDialog
        open={pollDialogOpen}
        onOpenChange={setPollDialogOpen}
        meetingId={meeting.id}
        onCreated={() => { pollPolls(); setPollDialogOpen(false) }}
      />
    </div>
  )
'''

new_src = before + new_render + after

with open(PATH, 'w') as f:
    f.write(new_src)

print(f"Wrote {len(new_src)} bytes")
