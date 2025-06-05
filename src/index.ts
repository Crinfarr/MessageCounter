import { ChannelType, Client, GuildChannel } from 'discord.js';
import sqlite3, { OPEN_CREATE } from 'sqlite3';
import { open as dbOpen } from 'sqlite'

(async () => {
    const db = await dbOpen({
        driver: sqlite3,
        filename: "MessageLogs.db"
    });
    db.exec(/*sql*/`
        CREATE TABLE IF NOT EXISTS BackupLogs (
            RanAt INTEGER PRIMARY KEY,
            FirstMsgID INTEGER NOT NULL UNIQUE,
            LastMsgID INTEGER NOT NULL UNIQUE,
            ChannelID INTEGER NOT NULL UNIQUE,
        );
        CREATE TABLE IF NOT EXISTS UserStats (
            UserID INTEGER PRIMARY KEY,
            MessageCount INTEGER NOT NULL,
            -- you can put other stuff here too
        );
    `)

    const app = new Client({
        intents: [
            'GuildMessages',
        ]
    });
    app.on('ready', async (client) => {
        const botGuilds = await Promise.all(
            (
                await client.guilds.fetch()//oauth2guild needs double fetch for some reason
            ).map(
                async (oaguild) => await oaguild.fetch()//so get it again i guess
            ));
        botGuilds.forEach(async (guild) => {
            //should be only 1 guild but this code is general purpose
            //so whatever
            // const { LastMsgID } = await db.get<{ LastMsgID: number }>(`SELECT LastMsgID FROM BackupLogs WHERE GuildID = ${guild.id}`);
            const channels = await guild.channels.fetch();
            channels.forEach(async (channel) => {
                var { LastMsgID } = await db.get<{ LastMsgID: number }>(`SELECT LastMsgID FROM BackupLogs WHERE ChannelID = ${channel.id}`);
                switch (channel.type) {
                    case ChannelType.GuildText:
                        if (LastMsgID == undefined || LastMsgID == null) {
                            //fetch everything (we've never been here before)
                            let last: string;
                            let first: string;
                            while (true) {
                                const msgs = await channel.messages.fetch((last == undefined) ? { limit: 100 } : { limit: 100, before: last });
                                if (first == undefined)
                                    first = msgs.at(0).id;
                                msgs.forEach((message) => {
                                    db.exec(/*sql*/`
                                        INSERT INTO UserStats (UserID, MessageCount)
                                        VALUES (${message.author.id}, 1)
                                        ON CONFLICT(UserID) DO UPDATE SET MessageCount = MessageCount + 1;
                                    `);
                                });
                                if (msgs.size > 0)
                                    last = msgs.at(-1).id;
                                if (msgs.size < 100) {//This briefly fails under the hyperspecific case where 
                                    //there are exactly a multiple of 100 messages, but will
                                    //recover when it receives a 0 length message array (i hope)
                                    db.exec(/*sql*/`
                                        INSERT INTO BackupLogs (RanAt, FirstMsgID, LastMsgID, ChannelID)
                                        VALUES (
                                            ${Date.now()},
                                            ${first},
                                            ${last},
                                            ${channel.id}
                                        )
                                        ON CONFLICT(ChannelID) DO UPDATE SET RanAt = ${Date.now()}, LastMsgID = ${last}
                                    `);
                                    break
                                }
                            }
                        } else { //Valid existing database
                            let last: string = LastMsgID.toString();
                            while (true) {//just in case it's been over 100 messages since last run
                                const msgs = await channel.messages.fetch({ limit: 100, after: last });
                                last = msgs.at(-1).id;
                                msgs.forEach((message) => {
                                    db.exec(/*sql*/`
                                        INSERT INTO UserStats (UserID, MessageCount)
                                        VALUES (${message.author.id}, 1)
                                        ON CONFLICT(UserID) DO UPDATE SET MessageCount = MessageCount + 1;
                                    `);
                                });
                                if (msgs.size > 0)
                                    last = msgs.at(-1).id;
                                if (msgs.size < 100) {//This briefly fails under the hyperspecific case where 
                                    //there are exactly a multiple of 100 messages, but will
                                    //recover when it receives a 0 length message array (i hope)
                                    db.exec(/*sql*/`
                                        INSERT INTO BackupLogs (RanAt, LastMsgID, ChannelID)
                                        VALUES (
                                            ${Date.now()},
                                            ${last},
                                            ${channel.id}
                                        )
                                        ON CONFLICT(ChannelID) DO UPDATE SET RanAt = ${Date.now()}, LastMsgID = ${last}
                                    `);
                                    break;
                                }
                            }
                        }
                        break;
                    case ChannelType.GuildAnnouncement:
                        //can replicate normal text channel logic here, probably
                        break;
                    case ChannelType.GuildForum:
                        //can replicate normal text channel logic here, probably
                        break;
                    case ChannelType.GuildMedia:
                        break;

                }
            })
        });
    });
    app.login(process.env.BOT_TOKEN);

})();