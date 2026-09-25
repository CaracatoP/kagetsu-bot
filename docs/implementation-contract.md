# Internal implementation contract

Runtime CommonJS for bot/API/shared, Next.js TypeScript frontend. Existing src remains bot to minimize migration risk. Root owns package.json dependency installs. Do not run live Discord mutations in tests.

Shared PostgreSQL pool: require packages/database (exports createDatabase, initDatabase, transaction). Existing src/database/db.js will re-export. Numbered migrations under packages/database/migrations/*.sql. Root owns 001_platform.sql. Bot module agent may add 002_community.sql. API session tables included in 001.

Store: require packages/database/store -> createStore(pool):
- ensureGuild(guildId,name) -> void
- getConfig(guildId) -> {config,version}; ensure defaults for missing guild
- saveConfig(guildId, config, actorId, expectedVersion) -> {config,version}; transaction optimistic lock, audit, pg_notify('kagetsu_config',guildId)
- listResources(guildId,kind), getResource(guildId,id,kind?), saveResource(guildId,kind,data,actorId,id?,expectedVersion?), deleteResource(guildId,id,actorId) -> row(s)
- audit(guildId,userId,action,target,oldValue,newValue)
- enqueue(guildId,actorId,action,payload) -> job row
Resource row: {id UUID,guild_id,kind,data JSONB,status:'draft'|'published'|'closed',channel_id,message_id,version integer,created_at,updated_at}. saveResource increments version, preserves Discord coordinates; data is form input only. All queries MUST include guild_id. All IDs from Discord are strings.

bot_jobs: id UUID,guild_id,actor_id,action,payload JSONB,status pending/running/done/failed,result JSONB,error,attempts,available_at,locked_at,created_at,updated_at. Bot claims FOR UPDATE SKIP LOCKED. API returns 202, frontend polls /guilds/:guildId/jobs/:jobId. Actions: publish_resource, unpublish_resource, send_embed, ticket_action, suggestion_status, moderation_action, reconcile_roles. publish_resource payload {resourceId}; unpublish_resource same; send_embed {resourceId}.

Kinds: role_panel, embed, custom_command, scheduled_message, ticket_panel, suggestion, event, giveaway, season, achievement, mission.
Resource data common: name,title,description,channelId,color,imageUrl,thumbnailUrl,footer.
- role_panel: type buttons/select/reactions; mode single/multiple; options [{id UUID or stable slug,label,emoji,roleId}], max25; group string optional.
- custom_command: name,response
- scheduled_message: content,channelId,runAt ISO UTC,recurrence none/daily/weekly,daysOfWeek number[] (0..6); guild timezone applies
- ticket_panel: title,description,channelId,categoryId,supportRoleIds[],categories [{id,label}]
- event: name,description,channelId,startsAt ISO,maxParticipants integer
- giveaway: title,channelId,endsAt ISO,winners integer,requiredRoleId optional
- season: name,startsAt,endsAt
- achievement: name,description,emoji,condition level/messages/voiceMinutes,value positive
- mission: name,period daily/weekly,condition messages/voiceMinutes,value,rewardXp
- embed: name,title,description,color,imageUrl,thumbnailUrl,footer,channelId,buttons [{label,url}]

guild_settings: guild_id PK FK guilds(id),config JSONB,version int,updated_at.
Default config contract:
{general:{prefix:'!',locale:'pt-BR',timezone:'America/Sao_Paulo'},modules:{levels:true,roles:true,welcome:false,moderation:false,automod:false,logs:false,tickets:false,suggestions:false,events:false,giveaways:false,tempVoice:false,scheduler:false,customCommands:false,achievements:false,missions:false,seasons:false,prestige:false},
levels:{chat:{enabled:true,min:15,max:25,cooldownSeconds:60},voice:{enabled:true,min:20,max:35,intervalMinutes:5},blockedChannelIds:[],blockedRoleIds:[],channelMultipliers:{},roleMultipliers:{},levelUpChannelId:'',curve:{type:'progressive',base:100,coefficient:50,thresholds:[]},requireProgression:false,rewardMode:'highest'},
rewards:[{id,name,level,roleId,xp:'0',requiredRoleId:''}],
progressions:[{id,name,emoji,baseRoleId,exclusiveGroup:'',mode:'highest'|'stack',ranks:[{id,name,level,roleId,xp:'0',requiredRoleId:''}]}],
appearance:{name:'Kagetsu',primary:'#b49aff',secondary:'#83beff',background:'#070910',backgroundUrl:'',logoUrl:'',barStyle:'rounded'},
profile:{roleIds:[],labels:[{name,roleId}],badges:[]},
welcome:{channelId:'',message:'Bem-vindo {user} ao {server}!',type:'text',leaveChannelId:'',leaveMessage:'{username} saiu do servidor.',autoroleIds:[],delayMinutes:0},
logs:{channels:{}}, moderation:{warnRules:[]},automod:{whitelistRoleIds:[],whitelistChannelIds:[],rules:[]},tickets:{logChannelId:''},suggestions:{channelId:''},tempVoice:{triggerChannelId:'',categoryId:''},prestige:{maxLevel:100}}

API endpoints externally via Next /api rewrite to API origin (no /api prefix internally):
GET /health; GET /auth/login; GET /auth/callback; GET /auth/me {user,csrfToken}; POST /auth/logout
GET /guilds -> {guilds:[{id,name,icon,installed,permissions,inviteUrl}]}
GET /guilds/:id -> {guild,config,version,channels,roles,permissions,status}; channels [{id,name,type}], roles [{id,name,color,manageable,dangerous}], permissions {missing:[]}
PUT /guilds/:id/config {config,version}; GET /guilds/:id/analytics?days=7
GET /guilds/:id/resources?kind=role_panel -> {resources:[]}
POST /guilds/:id/resources {kind,data}; PUT /guilds/:id/resources/:resourceId {data,version}; DELETE same
POST /guilds/:id/resources/:resourceId/publish; POST .../unpublish; POST .../send
GET /guilds/:id/jobs/:jobId -> {job}; GET /guilds/:id/audit -> {entries:[]}
GET /guilds/:id/tickets; POST /guilds/:id/tickets/:ticketId/action {action}; GET /guilds/:id/moderation
Mutation credentials cookie + x-csrf-token and Origin check; per-guild auth rechecked using Discord each mutation. All API access guild authorization on server. No dev auth bypass. UI can show honest unauthenticated/setup state.

OAuth cookie/session hosted at dashboard origin through rewrites: WEB_URL=http://localhost:3000, API_ORIGIN=http://localhost:3001, callback WEB_URL/api/auth/callback. Secrets only server env. Bot/API separate processes. API may use bot token server-side for read-only live Discord metadata and permission validation; bot executes writes via jobs. OAuth encrypted tokens in sessions, SESSION_SECRET key >=32 chars, session opaque token hash in DB.

Root adds root deps express,pino,zod,helmet,cookie-parser,express-rate-limit,luxon and dev eslint. Frontend agent owns apps/web/package.json; root runs installs. Any contract change coordinate by message.
