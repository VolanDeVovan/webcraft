import { v4 as uuid } from 'uuid';
import path from 'path'
import sqlite3 from 'sqlite3'
import {open} from 'sqlite'
import { copyFile } from 'fs/promises';

import {Mob} from "./mob.js";

import {CHUNK_SIZE_X, CHUNK_SIZE_Y, CHUNK_SIZE_Z} from "../www/js/chunk_const.js";
import {Vector} from "../www/js/helpers.js";
import {ServerClient} from "../www/js/server_client.js";
import {BLOCK} from "../www/js/blocks.js";
import { DropItem } from './drop_item.js';
import { INVENTORY_SLOT_COUNT } from '../www/js/constant.js';

export class DBWorld {

    static TEMPLATE_DB = './world.sqlite3.template';

    constructor(db, world) {
        this.db = db;
        this.world = world;
    }

    // Open database and return provider
    static async openDB(dir, world) {
        let filename = dir + '/world.sqlite';
        filename = path.resolve(filename);
        // Check directory exists
        if (!fs.existsSync(dir)) {
            await fs.mkdirSync(dir, {recursive: true});
        }
        // Recheck directory exists
        if (!fs.existsSync(dir)) {
            throw 'World directory not found: ' + dir;
        }
        // If DB file not exists, then create it from template
        if (!fs.existsSync(filename)) {
            // create db from template
            let template_db_filename = path.resolve(DBWorld.TEMPLATE_DB);
            await copyFile(template_db_filename, filename);
        }
        // Open SQLIte3 fdatabase file
        let dbc = await open({
            filename: filename,
            driver: sqlite3.Database
        }).then(async (conn) => {
            return new DBWorld(conn, world);
        });
        await dbc.applyMigrations();
        return dbc;
    }

    // Возвращает мир по его GUID либо создает и возвращает его
    async getWorld(world_guid) {
        let row = await this.db.get("SELECT * FROM world WHERE guid = ?", [world_guid]);
        if(row) {
            return {
                id:         row.id,
                user_id:    row.user_id,
                dt:         row.dt,
                guid:       row.guid,
                title:      row.title,
                seed:       row.seed,
                game_mode:  row.game_mode,
                generator:  JSON.parse(row.generator),
                pos_spawn:  JSON.parse(row.pos_spawn),
                state:      null,
                add_time:   row.add_time
            }
        }
        // Insert new world to Db
        let world = await Game.db.getWorld(world_guid);
        await this.db.run('INSERT INTO world(dt, guid, user_id, title, seed, generator, pos_spawn) VALUES (:dt, :guid, :user_id, :title, :seed, :generator, :pos_spawn)', {
            ':dt':          ~~(Date.now() / 1000),
            ':guid':        world.guid,
            ':user_id':     world.user_id,
            ':title':       world.title,
            ':seed':        world.seed,
            ':generator':   JSON.stringify(world.generator),
            ':pos_spawn':   JSON.stringify(world.pos_spawn)
        });
        // let world_id = result.lastID;
        return this.getWorld(world_guid);
    }

    async updateAddTime(world_guid, add_time) {
        await this.db.run('UPDATE world SET add_time = :add_time WHERE guid = :world_guid', {
            ':world_guid':  world_guid,
            ':add_time':    add_time
        });
    }

    // Migrations
    async applyMigrations() {
        let version = 0;
        try {
            // Read options
            let row = await this.db.get('SELECT version FROM options');
            version = row.version;
        } catch(e) {
            await this.db.get('BEGIN TRANSACTION');
            await this.db.get('CREATE TABLE "options" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "version" integer NOT NULL DEFAULT 0)');
            await this.db.get('INSERT INTO options(version) values(0)');
            await this.db.get('COMMIT');
        }
        const migrations = [];
        migrations.push({version: 1, queries: [
            'ALTER TABLE user ADD COLUMN indicators text',
            {
                sql: 'UPDATE user SET indicators = :indicators',
                placeholders: {
                    ':indicators':  JSON.stringify(this.getDefaultPlayerIndicators()),
                }
            }
        ]});
        migrations.push({version: 2, queries: [
            'alter table user add column is_admin integer default 0',
            'update user set is_admin = 1 where id in (select user_id from world)',
        ]});
        migrations.push({version: 3, queries: [
            `CREATE TABLE "entity" (
                "id" INTEGER NOT NULL,
                "dt" integer,
                "entity_id" TEXT,
                "type" TEXT,
                "skin" TEXT,
                "indicators" TEXT,
                "rotate" TEXT,
                "x" real,
                "y" real,
                "z" real,
                PRIMARY KEY ("id")
              )`
        ]});
        migrations.push({version: 4, queries: [
            `alter table world add column "game_mode" TEXT DEFAULT 'survival'`,
            `alter table user add column "chunk_render_dist" integer DEFAULT 4`
        ]});
        migrations.push({version: 5, queries: [
            `CREATE INDEX "world_modify_xyz" ON "world_modify" ("x", "y", "z")`,
        ]});
        migrations.push({version: 6, queries: [
            `update world_modify set params = replace(replace(replace(replace(replace(replace(replace(params,',"rotate":{"x":0,"y":0,"z":0}', ''), ',"entity_id":""', ''), ',"entity_id":null', ''), ',"extra_data":null', ''), ',"power":1', ''), '{"id":0}', ''), '{}', '') where params is not null`,
            `update world_modify set params = null where params is not null and params = ''`,
            `update world_modify set params = '{"id":2}' where params is not null and params like '{"id":2,%'`
        ]});
        migrations.push({version: 7, queries: [
            `update world_modify set params = '{"id":50,"rotate":{"x":0,"y":1,"z":0}}' where params is not null and params like '{"id":50,%'`
        ]});
        migrations.push({version: 8, queries: [
            `alter table entity add column "pos_spawn" TEXT NOT NULL DEFAULT ''`,
            `update entity set pos_spawn = '{"x":' || x || ',"y":' || y || ',"z":' || z || '}' where pos_spawn = '';`
        ]});
        migrations.push({version: 9, queries: [
            `alter table chest add column "is_deleted" integer DEFAULT 0`
        ]});
        migrations.push({version: 10, queries: [
            `CREATE TABLE "drop_item" (
                "id" INTEGER NOT NULL,
                "dt" integer,
                "entity_id" TEXT,
                "items" TEXT,
                "x" real,
                "y" real,
                "z" real,
                PRIMARY KEY ("id")
              )`,
            ]});
        migrations.push({version: 11, queries: [
            `DROP INDEX "main"."world_modify_xyz";`,
            //
            `ALTER TABLE "main"."world_modify" RENAME TO "_world_modify_old_20211227";`,
            //
            `CREATE TABLE "main"."world_modify" (
                "id" INTEGER,
                "world_id" INTEGER NOT NULL,
                "dt" integer,
                "user_id" INTEGER,
                "params" TEXT,
                "user_session_id" INTEGER,
                "x" real NOT NULL,
                "y" real NOT NULL,
                "z" real NOT NULL,
                "entity_id" text,
                "extra_data" text,
                PRIMARY KEY ("id"),
                UNIQUE ("entity_id" ASC) ON CONFLICT ABORT
              );`,
            //
            `INSERT INTO "main"."world_modify" ("id", "world_id", "dt", "user_id", "params", "user_session_id", "x", "y", "z", "entity_id", "extra_data") SELECT "id", "world_id", "dt", "user_id", "params", "user_session_id", "x", "y", "z", "entity_id", "extra_data" FROM "main"."_world_modify_old_20211227";`,
            //
            `CREATE INDEX "main"."world_modify_xyz" ON "world_modify" ("x" ASC, "y" ASC, "z" ASC);`,
            `DROP TABLE "_world_modify_old_20211227"`
        ]});
        migrations.push({version: 12, queries: [`alter table drop_item add column "is_deleted" integer DEFAULT 0`]});
        migrations.push({version: 13, queries: [`alter table user add column "game_mode" TEXT DEFAULT NULL`]});
        migrations.push({version: 14, queries: [`UPDATE user SET inventory = replace(inventory, '"index2":0', '"index2":-1')`]});
        migrations.push({version: 15, queries: [`UPDATE entity SET x = json_extract(pos_spawn, '$.x'), y = json_extract(pos_spawn, '$.y'), z = json_extract(pos_spawn, '$.z')`]});
        migrations.push({version: 16, queries: [
            `CREATE TABLE "painting" (
                "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                "user_id" integer NOT NULL,
                "dt" integer NOT NULL,
                "params" TEXT,
                "x" integer NOT NULL,
                "y" integer NOT NULL,
                "z" integer NOT NULL,
                "image_name" TEXT,
                "entity_id" TEXT,
                "world_id" INTEGER
            );`
        ]});
        migrations.push({version: 17, queries: [`alter table world_modify add column "ticks" INTEGER DEFAULT NULL`]});
        migrations.push({version: 18, queries: [`UPDATE world_modify SET params = '{"id":612}' WHERE params = '{"id":141}';`]});
        migrations.push({version: 19, queries: [`UPDATE world_modify SET extra_data = '{"stage":0}' WHERE params = '{"id":59}' OR params LIKE '{"id":59,%';`]});
        migrations.push({version: 20, queries: [
            `DELETE FROM world_modify WHERE params = '{"id":75}' OR params LIKE '{"id":75,%';`,
            `DELETE FROM world_modify WHERE params = '{"id":76}' OR params LIKE '{"id":76,%';`
        ]});
        migrations.push({version: 21, queries: [
            `UPDATE user SET pos_spawn = (SELECT pos_spawn FROM world) WHERE ABS(json_extract(pos_spawn, '$.x')) > 2000000000 OR ABS(json_extract(pos_spawn, '$.y')) > 2000000000 OR ABS(json_extract(pos_spawn, '$.z')) > 2000000000`,
            `UPDATE user SET pos = pos_spawn WHERE ABS(json_extract(pos, '$.x')) > 2000000000 OR ABS(json_extract(pos, '$.y')) > 2000000000 OR ABS(json_extract(pos, '$.z')) > 2000000000`
        ]});
        migrations.push({version: 22, queries: [`alter table world add column "add_time" INTEGER DEFAULT 7000`]});
        migrations.push({version: 23, queries: [
            `UPDATE world_modify SET params = '{"id":365}' WHERE params LIKE '{"id":350%';`,
            `UPDATE world_modify SET params = '{"id":361}' WHERE params LIKE '{"id":351%';`,
            `UPDATE world_modify SET params = '{"id":362}' WHERE params LIKE '{"id":352%';`,
            `UPDATE world_modify SET params = '{"id":359}' WHERE params LIKE '{"id":353%';`,
            `UPDATE world_modify SET params = '{"id":357}' WHERE params LIKE '{"id":354%';`,
            `UPDATE world_modify SET params = '{"id":363}' WHERE params LIKE '{"id":355%';`,
            `UPDATE world_modify SET params = '{"id":364}' WHERE params LIKE '{"id":502%';`,
            `UPDATE world_modify SET params = '{"id":354}' WHERE params LIKE '{"id":506%';`,
        ]});
        migrations.push({version: 24, queries: [
            `UPDATE entity SET skin = 'base' WHERE type = 'axolotl' and skin = 'blue'`,
        ]});
        migrations.push({version: 25, queries: [
            `UPDATE user SET game_mode = 'survival' WHERE game_mode IS NOT NULL AND is_admin = 0`,
        ]});
        migrations.push({version: 26, queries: [
            `UPDATE world_modify set params = '{"id": 3}' where  params like '{"id":3,"rotate":{"x":-%'`,
        ]});
        migrations.push({version: 27, queries: [
            `CREATE TABLE "quest" ("id" INTEGER NOT NULL, "quest_group_id" INTEGER NOT NULL, "title" TEXT NOT NULL, "description" TEXT, PRIMARY KEY ("id"));`,
            `CREATE TABLE "quest_action" ("id" INTEGER NOT NULL, "quest_id" INTEGER NOT NULL, "quest_action_type_id" INTEGER, "block_id" INTEGER, "cnt" integer, "pos" TEXT, "description" TEXT, PRIMARY KEY ("id"));`,
            `CREATE TABLE "quest_action_type" ("id" INTEGER NOT NULL, "title" TEXT, PRIMARY KEY ("id"));`,
            `INSERT INTO "quest_action_type" VALUES (1, 'Добыть');`,
            `INSERT INTO "quest_action_type" VALUES (2, 'Скрафтить');`,
            `INSERT INTO "quest_action_type" VALUES (3, 'Установить блок');`,
            `INSERT INTO "quest_action_type" VALUES (4, 'Использовать инструмент');`,
            `INSERT INTO "quest_action_type" VALUES (5, 'Достигнуть координат');`,
            `CREATE TABLE "quest_group" ("id" INTEGER NOT NULL, "title" TEXT, PRIMARY KEY ("id"));`,
            `CREATE TABLE "quest_reward" ("id" INTEGER NOT NULL, "quest_id" INTEGER NOT NULL, "block_id" INTEGER NOT NULL, "cnt" TEXT NOT NULL, PRIMARY KEY ("id"));`,
            `CREATE TABLE "user_quest" ("id" INTEGER NOT NULL, "dt" TEXT, "user_id" INTEGER NOT NULL, "quest_id" INTEGER NOT NULL, "actions" TEXT, PRIMARY KEY ("id"));`
        ]});
        //
        migrations.push({version: 28, queries: [
            `INSERT INTO "quest"(id, quest_group_id, title, description) VALUES (1, 1, 'Добыть дубовые брёвна', 'Необходимо добыть бревна дуба. После этого вы сможете скрафтить орудия, для дальнейшего развития.\r\n` +
            `\r\n` +
            `1-й шаг — Найдите дерево\r\n` +
            `Найдите любое дерево, подойдите к нему так близко, чтобы вокруг блока древесины, на которую вы нацелены появилась тонкая обводка. Зажмите левую кнопку мыши и не отпускайте, пока не будет добыто бревно.\r\n` +
            `Чтобы сломать бревно рукой нужно примерно 6 секунд.\r\n` +
            `\r\n` +
            `2-й шаг — Подберите блок\r\n` +
            `Подойдите ближе к выпавшему блоку, он попадёт в ваш инвентарь.');`,

            `INSERT INTO "quest"(id, quest_group_id, title, description) VALUES (2, 2, 'Выкопать землю', 'Это земляные работы. Почувствуй себя землекопом.\r\n` +
            `Земля (она же дёрн) может быть добыта чем угодно.');`,

            `INSERT INTO "quest"(id, quest_group_id, title, description) VALUES (3, 1, 'Скрафтить и установить верстак', 'Необходимо скрафтить и установить верстак. Без него вы не сможете дальше развиваться.\r\n` +
            `\r\n` +
            `1-й шаг\r\n` +
            `Поместите 4 единицы досок в 4 слота инвентаря и заберите в правой части верстак.\r\n` +
            `\r\n` +
            `2-й шаг\r\n` +
            `Поместите верстак в один из нижних слотов инвентаря\r\n` +
            `\r\n` +
            `3-й шаг\r\n` +
            `Выйдите из инвентаря нажав клавишу «E». Выберите слот, в котором находится предмет крутя колесико мыши или клавишами 1-9. Установите верстак на землю правой кнопкой мыши.\r\n` +
            `\r\n` +
            `Теперь вы можете создавать сложные предметы в верстаке. Простые предметы, такие как доски и палки также можно создавать в верстаке. Вы можете забрать верстак с собой, сломав его руками, топор сделает это гораздо быстрее. Пример создания деревянной кирки из досок и палок.');`,
            // actions
            `INSERT INTO "quest_action" VALUES (1, 1, 1, 3, 5, NULL, 'Добыть 5 дубовых брёвен');`,
            `INSERT INTO "quest_action" VALUES (2, 2, 1, 2, 20, NULL, 'Выкопать 20 земляных блоков');`,
            `INSERT INTO "quest_action" VALUES (3, 3, 2, 58, 1, NULL, 'Скрафтить верстак');`,
            `INSERT INTO "quest_action" VALUES (4, 3, 3, 58, 1, NULL, 'Установить верстак в удобном для вас месте');`,
            // groups
            `INSERT INTO "quest_group" VALUES (1, 'Основные задания');`,
            `INSERT INTO "quest_group" VALUES (2, 'Дополнительные задания');`,
            // rewards
            `INSERT INTO "quest_reward" VALUES (1, 1, 3, 8);`,
            `INSERT INTO "quest_reward" VALUES (2, 2, 2, 20);`,
            `INSERT INTO "quest_reward" VALUES (3, 3, 130, 4);`,
            `INSERT INTO "quest_reward" VALUES (4, 3, 59, 4);`
        ]});
        migrations.push({version: 29, queries: [`alter table user_quest add column "is_completed" integer NOT NULL DEFAULT 0`]});
        migrations.push({version: 30, queries: [
            `alter table quest add column "is_default" integer NOT NULL DEFAULT 0`,
            `update quest set is_default = 1 where id in(1, 2, 3)`
        ]});
        migrations.push({version: 31, queries: [`alter table user_quest add column "in_progress" integer NOT NULL DEFAULT 0`]});
        migrations.push({version: 32, queries: [`delete from user_quest`]});
        migrations.push({version: 33, queries: [
            `UPDATE quest SET is_default = 0 WHERE id = 3`,
            `ALTER TABLE quest ADD COLUMN "next_quests" TEXT`,
            `UPDATE quest SET next_quests = '[3]' WHERE id = 1`
        ]});
        migrations.push({version: 34, queries: [
            `DELETE FROM user_quest;`,
            `UPDATE quest SET is_default = 0, next_quests = '[2]' WHERE id = 3;`,
            `UPDATE quest SET is_default = 0 WHERE id = 2;`,
            // Update quest 1
            `UPDATE quest SET description = 'Необходимо добыть бревна дуба. После этого вы сможете скрафтить орудия, для дальнейшего развития.\r\n` +
            `\r\n` +
            `1-й шаг — Найдите дерево\r\n` +
            `Найдите любое дерево, подойдите к нему так близко, чтобы вокруг блока древесины, на которую вы нацелены появилась тонкая обводка. Зажмите левую кнопку мыши и не отпускайте, пока не будет добыто бревно.\r\n` +
            `Чтобы сломать бревно рукой нужно примерно 6 секунд.\r\n` +
            `\r\n` +
            `2-й шаг — Подберите блок\r\n` +
            `Подойдите ближе к выпавшему блоку, он попадёт в ваш инвентарь.' WHERE id = 1;`,
            // Update quest 2
            `UPDATE quest SET description = 'Это земляные работы. Почувствуй себя землекопом.\r\n` +
            `Земля (она же дёрн) может быть добыта чем угодно.' WHERE id = 2;`,
            // Update quest 3
            `UPDATE quest SET description = 'Необходимо скрафтить и установить верстак. Без него вы не сможете дальше развиваться.\r\n` +
            `\r\n` +
            `1-й шаг\r\n` +
            `Поместите 4 единицы досок в 4 слота инвентаря и заберите в правой части верстак.\r\n` +
            `\r\n` +
            `2-й шаг\r\n` +
            `Поместите верстак в один из нижних слотов инвентаря\r\n` +
            `\r\n` +
            `3-й шаг\r\n` +
            `Выйдите из инвентаря нажав клавишу «E». Выберите слот, в котором находится предмет крутя колесико мыши или клавишами 1-9. Установите верстак на землю правой кнопкой мыши.\r\n` +
            `\r\n` +
            `Теперь вы можете создавать сложные предметы в верстаке. Простые предметы, такие как доски и палки также можно создавать в верстаке. Вы можете забрать верстак с собой, сломав его руками, топор сделает это гораздо быстрее.' WHERE id = 3;`,
        ]});
        migrations.push({version: 35, queries: [
            `CREATE TABLE "chunk" ("id" INTEGER NOT NULL, "dt" integer, "addr" TEXT, "mobs_is_generated" integer NOT NULL DEFAULT 0, PRIMARY KEY ("id"));`,
        ]});
        migrations.push({version: 36, queries: [
            `DELETE FROM entity;`,
            `DELETE FROM chunk;`,
        ]});
        migrations.push({version: 37, queries: [
            `update quest_action set block_id = 18 where block_id = 2;`,
            `update user_quest set actions = replace(actions, '"block_id":2,', '"block_id":18,');`,
        ]});
        migrations.push({version: 38, queries: [
            `DELETE FROM entity;`,
            `DELETE FROM chunk;`,
        ]});

        migrations.push({version: 39, queries: [
            `CREATE TABLE "teleport_points" (
            "id" INTEGER PRIMARY KEY AUTOINCREMENT,
            "user_id" integer NOT NULL,
            "x" real NOT NULL,
            "y" real NOT NULL,
            "z" real NOT NULL,
            "title" VARCHER(50)
            );`
        ]});

        migrations.push({version: 40, queries: [
            `alter table world_modify add column "block_id" integer DEFAULT NULL`,
            `UPDATE world_modify SET block_id = json_extract(params, '$.id') WHERE params IS NOT NULL`
        ]});

        migrations.push({version: 41, queries: [
            `UPDATE world_modify AS m
            SET extra_data = COALESCE((SELECT '{"can_destroy":' || (case when c.slots is null then 'true' when c.slots = '{}' then 'true' else 'false' end) || ',"slots":' || coalesce(c.slots, '{}') || '}' from chest c where m.entity_id = c.entity_id), '{"can_destroy":true,"slots":{}}')
            WHERE m.block_id = 54 AND m.extra_data IS NULL`
        ]});

        migrations.push({version: 42, queries: [
            `update world_modify set extra_data = '{"can_destroy":true,"slots":{}}' where block_id = 61 and extra_data is null`
        ]});

        migrations.push({version: 43, queries: []});

        migrations.push({version: 44, queries: []});

        migrations.push({version: 45, queries: [
            `UPDATE world_modify SET block_id = 98, params = '{"id": 98}' WHERE block_id IN(43, 125);`,
            `UPDATE user SET inventory = REPLACE(inventory, '"id":43,', '"id":98,');`,
            `UPDATE user SET inventory = REPLACE(inventory, ',"id":43}', ',"id":98}');`,
            `UPDATE user SET inventory = REPLACE(inventory, '"id":125,', '"id":98,');`,
            `UPDATE user SET inventory = REPLACE(inventory, ',"id":125}', ',"id":98}');`,
            `UPDATE world_modify SET extra_data = '{"active":true}' WHERE block_id = 660;`,
        ]});

        migrations.push({version: 46, queries: [
            `UPDATE world_modify SET block_id = 1315, params = '{"id": 1315}' WHERE block_id = 450;`,
            `UPDATE world_modify SET block_id = 1311, params = '{"id": 1311}' WHERE block_id = 451;`,
            `UPDATE world_modify SET block_id = 1312, params = '{"id": 1312}' WHERE block_id = 452;`,
            `UPDATE world_modify SET block_id = 1309, params = '{"id": 1309}' WHERE block_id = 453;`,
            `UPDATE world_modify SET block_id = 1307, params = '{"id": 1307}' WHERE block_id = 454;`,
            `UPDATE world_modify SET block_id = 1313, params = '{"id": 1313}' WHERE block_id = 455;`,
            `UPDATE world_modify SET block_id = 1314, params = '{"id": 1314}' WHERE block_id = 503;`,
            `UPDATE world_modify SET block_id = 1304, params = '{"id": 1304}' WHERE block_id = 507;`,
            `UPDATE user SET inventory = REPLACE(inventory, '"id":450,', '"id":1315,');`,
            `UPDATE user SET inventory = REPLACE(inventory, ',"id":450}', ',"id":1315}');`,
            `UPDATE user SET inventory = REPLACE(inventory, '"id":451,', '"id":1311,');`,
            `UPDATE user SET inventory = REPLACE(inventory, ',"id":451}', ',"id":1311}');`,
            `UPDATE user SET inventory = REPLACE(inventory, '"id":452,', '"id":1312,');`,
            `UPDATE user SET inventory = REPLACE(inventory, ',"id":452}', ',"id":1312}');`,
            `UPDATE user SET inventory = REPLACE(inventory, '"id":453,', '"id":1309,');`,
            `UPDATE user SET inventory = REPLACE(inventory, ',"id":453}', ',"id":1309}');`,
            `UPDATE user SET inventory = REPLACE(inventory, '"id":454,', '"id":1307,');`,
            `UPDATE user SET inventory = REPLACE(inventory, ',"id":454}', ',"id":1307}');`,
            `UPDATE user SET inventory = REPLACE(inventory, '"id":455,', '"id":1313,');`,
            `UPDATE user SET inventory = REPLACE(inventory, ',"id":455}', ',"id":1313}');`,
            `UPDATE user SET inventory = REPLACE(inventory, '"id":503,', '"id":1314,');`,
            `UPDATE user SET inventory = REPLACE(inventory, ',"id":503}', ',"id":1314}');`,
            `UPDATE user SET inventory = REPLACE(inventory, '"id":507,', '"id":1304,');`,
            `UPDATE user SET inventory = REPLACE(inventory, ',"id":507}', ',"id":1304}');`,
        ]});

        migrations.push({version: 47, queries: [
            `UPDATE user SET inventory = REPLACE(inventory, '}"', ',"');`,
        ]});

        migrations.push({version: 48, queries: [
            `ALTER TABLE entity ADD COLUMN "is_active" integer NOT NULL DEFAULT 1`,
            `ALTER TABLE "user" ADD COLUMN stats TEXT;`
        ]});

        migrations.push({version: 49, queries: [
            {
                sql: 'UPDATE "user" SET stats = :stats WHERE stats IS NULL OR stats == :null',
                placeholders: {
                    ':stats':  JSON.stringify(this.getDefaultPlayerStats()),
                    ':null':  'null'
                }
            }
        ]});

        migrations.push({version: 50, queries: [
            `UPDATE entity SET is_active = 0 WHERE indicators LIKE '%"live","value":0}%'`,
        ]});

        migrations.push({version: 51, queries: [
            `UPDATE "quest" SET "title" = '{"ru":"Добыть дубовые брёвна","en":"Get oak logs"}', "description" = '{"ru":"Необходимо добыть бревна дуба. После этого вы сможете скрафтить орудия, для дальнейшего развития.\\r\\n\\r\\n1-й шаг — Найдите дерево\\r\\nНайдите любое дерево, подойдите к нему так близко, чтобы вокруг блока древесины, на которую вы нацелены появилась тонкая обводка. Зажмите левую кнопку мыши и не отпускайте, пока не будет добыто бревно.\\r\\nЧтобы сломать бревно рукой нужно примерно 6 секунд.\\r\\n\\r\\n2-й шаг — Подберите блок\\r\\nПодойдите ближе к выпавшему блоку, он попадёт в ваш инвентарь.","en":"You need to get oak logs. After that, you can craft weapons for further development.\\r\\n\\r\\n1st step - Find a tree\\r\\nFind any tree, get close enough to it so that a thin outline appears around the block of wood you are aiming at. Hold down the left mouse button and do not release until the log is mined.\\r\\nIt takes about 6 seconds to break a log by hand.\\r\\n\\r\\n2nd step - Pick up a block\\r\\nGet closer to the dropped block, it will go into your inventory."}' WHERE "id" = 1;`,
            `UPDATE "quest" SET "title" = '{"ru":"Выкопать землю","en":"Dig up the dirt"}', "description" = '{"ru":"Это земляные работы. Почувствуй себя землекопом.\\r\\nЗемля (она же дёрн) может быть добыта чем угодно.","en":"This is earthworks. Feel like a digger.\\r\\nDirt can be mined by anything."}' WHERE "id" = 2;`,
            `UPDATE "quest" SET "title" = '{"ru":"Скрафтить и установить Верстак","en":"Craft and install a Crafting Table"}', "description" = '{"ru":"Необходимо скрафтить и установить верстак. Без него вы не сможете дальше развиваться.\\r\\n\\r\\n1-й шаг\\r\\nПоместите 4 единицы досок в 4 слота инвентаря и заберите в правой части верстак.\\r\\n\\r\\n2-й шаг\\r\\nПоместите верстак в один из нижних слотов инвентаря\\r\\n\\r\\n3-й шаг\\r\\nВыйдите из инвентаря нажав клавишу «E». Выберите слот, в котором находится предмет крутя колесико мыши или клавишами 1-9. Установите верстак на землю правой кнопкой мыши.\\r\\n\\r\\nТеперь вы можете создавать сложные предметы в верстаке. Простые предметы, такие как доски и палки также можно создавать в верстаке. Вы можете забрать верстак с собой, сломав его руками, топор сделает это гораздо быстрее.","en":"You need to craft and install a Crafting Table. Without it, you will not be able to develop further.\\r\\n\\r\\n1st step\\r\\nPlace 4 planks in the 4 inventory slots and take the Crafting Table on the right side.\\r\\n\\r\\n2nd step\\r\\nPlace the Crafting Table in one of the lower inventory slots\\r\\n\\r\\n3rd step\\r\\nExit the inventory by pressing the \\"E\\" key. Select the slot the item is in by scrolling the mouse wheel or using the 1-9 keys. Place the Crafting Table on the ground with the right mouse button.\\r\\n\\r\\nYou can now craft complex items at the Crafting Table. Simple items like planks and sticks can also be crafted at the Crafting Table. You can take the Crafting Table with you by breaking it with your hands, the ax will do it much faster."}' WHERE "id" = 3;`,
            `UPDATE "quest_action" SET "description" = '{"ru":"Добыть 5 дубовых брёвен","en":"Mine 5 oak logs"}' WHERE "id" = 1;`,
            `UPDATE "quest_action" SET "description" = '{"ru":"Выкопать 20 земляных блоков","en":"Dig 20 dirt blocks"}' WHERE "id" = 2;`,
            `UPDATE "quest_action" SET "description" = '{"ru":"Скрафтить верстак","en":"Craft a Crafting Table"}' WHERE "id" = 3;`,
            `UPDATE "quest_action" SET "description" = '{"ru":"Установить верстак в удобном для вас месте","en":"Install the Crafting Table in a convenient place for you"}' WHERE "id" = 4;`,
            `UPDATE "quest_action_type" SET "title" = '{"ru":"Добыть","en":"Mine"}' WHERE "id" = 1;`,
            `UPDATE "quest_action_type" SET "title" = '{"ru":"Скрафтить","en":"Craft"}' WHERE "id" = 2;`,
            `UPDATE "quest_action_type" SET "title" = '{"ru":"Установить блок","en":"Set block"}' WHERE "id" = 3;`,
            `UPDATE "quest_action_type" SET "title" = '{"ru":"Использовать инструмент","en":"Use tool"}' WHERE "id" = 4;`,
            `UPDATE "quest_action_type" SET "title" = '{"ru":"Достигнуть координат","en":"Reach the coordinates"}' WHERE "id" = 5;`,
            `UPDATE "quest_group" SET "title" = '{"ru":"Основные задания","en":"Main tasks"}' WHERE "id" = 1;`,
            `UPDATE "quest_group" SET "title" = '{"ru":"Дополнительные задания","en":"Additional tasks"}' WHERE "id" = 2;`,

            `DELETE FROM user_quest`,

            /*
            `UPDATE quest_group SET title = json_object('ru', title, 'en', title) WHERE title NOT LIKE '%{"%';`,
            `UPDATE quest SET title = json_object('ru', title, 'en', title) WHERE title NOT LIKE '%{"%';`,
            `UPDATE quest SET description = json_object('ru', description, 'en', description) WHERE description NOT LIKE '%{"%';`,
            `UPDATE quest_action_type SET title = json_object('ru', title, 'en', title) WHERE title NOT LIKE '%{"%';`,
            `UPDATE quest_action SET description = json_object('ru', description, 'en', description) WHERE description NOT LIKE '%{"%';`,
            */
        ]});

        migrations.push({version: 52, queries: [
            `DELETE from world_modify WHERE json_extract(params, '$.rotate.x') > 3 AND block_id = 50`,
        ]});

        migrations.push({version: 53, queries: [
            'ALTER TABLE entity ADD COLUMN extra_data text'
        ]});

        migrations.push({version: 54, queries: [
            'DELETE FROM world_modify WHERE block_id = 105'
        ]});

        for(let m of migrations) {
            if(m.version > version) {
                await this.db.get('begin transaction');
                for(let query of m.queries) {
                    if (typeof query === 'string') {
                        await this.db.get(query);
                    } else {
                        await this.db.run(query.sql, query.placeholders);
                    }
                }
                await this.db.get('UPDATE options SET version = ' + (++version));
                await this.db.get('commit');
                // Auto vacuum
                await this.db.get('VACUUM');
                version = m.version;
                console.info('Migration applied: ' + version);
            }
        }

    }

    async TransactionBegin() {
        await this.db.get('begin transaction');
    }

    async TransactionCommit() {
        await this.db.get('commit');
    }

    async TransactionRollback() {
        await this.db.get('rollback');
    }

    // getDefaultPlayerIndicators...
    getDefaultPlayerIndicators() {
        return {
            live: {
                name:  'live',
                value: 20,
            },
            food: {
                name:  'food',
                value: 20,
            },
            oxygen: {
                name:  'oxygen',
                value: 10,
            },
        };
    }

    // Return default inventory for user
    getDefaultInventory() {
        const MAX_INVERTORY_SLOT_COUNT = 42;
        const resp = {
            items: new Array(MAX_INVERTORY_SLOT_COUNT).fill(null),
            current: {
                index: 0, // right hand
                index2: -1 // left hand
            }
        };
        return resp;
    }

    // getDefaultPlayerStats...
    getDefaultPlayerStats() {
        return {death: 0, time: 0, pickat: 0, distance: 0}
    }

    // Register new user or return existed
    async registerUser(world, player) {
        // Find existing user record
        const row = await this.db.get("SELECT id, inventory, pos, pos_spawn, rotate, indicators, chunk_render_dist, game_mode, stats FROM user WHERE guid = ?", [player.session.user_guid]);
        if(row) {
            const inventory = JSON.parse(row.inventory);
            if(inventory.items.length < INVENTORY_SLOT_COUNT) {
                inventory.items.push(...new Array(INVENTORY_SLOT_COUNT - inventory.items.length).fill(null));
            }
            // Added new property
            if(inventory.current.index2 === undefined) {
                inventory.current.index2 = -1;
            }
            return {
                state: {
                    pos:                new Vector(JSON.parse(row.pos)),
                    pos_spawn:          new Vector(JSON.parse(row.pos_spawn)),
                    rotate:             new Vector(JSON.parse(row.rotate)),
                    indicators:         JSON.parse(row.indicators),
                    chunk_render_dist:  row.chunk_render_dist,
                    game_mode:          row.game_mode || world.info.game_mode,
                    stats:              JSON.parse(row.stats)
                },
                inventory: inventory
            };
        }
        const default_pos_spawn = world.info.pos_spawn;
        // Insert to DB
        const result = await this.db.run('INSERT INTO user(id, guid, username, dt, pos, pos_spawn, rotate, inventory, indicators, is_admin, stats) VALUES(:id, :guid, :username, :dt, :pos, :pos_spawn, :rotate, :inventory, :indicators, :is_admin, :stats)', {
            ':id':          player.session.user_id,
            ':dt':          ~~(Date.now() / 1000),
            ':guid':        player.session.user_guid,
            ':username':    player.session.username,
            ':pos':         JSON.stringify(default_pos_spawn),
            ':pos_spawn':   JSON.stringify(default_pos_spawn),
            ':rotate':      JSON.stringify(new Vector(0, 0, Math.PI)),
            ':inventory':   JSON.stringify(this.getDefaultInventory()),
            ':indicators':  JSON.stringify(this.getDefaultPlayerIndicators()),
            ':is_admin':    (world.info.user_id == player.session.user_id) ? 1 : 0,
            ':stats':       JSON.stringify(this.getDefaultPlayerStats())
        });
        return await this.registerUser(world, player);
    }

    // Добавление сообщения в чат
    async insertChatMessage(player, params) {
        const result = await this.db.run('INSERT INTO chat_message(user_id, dt, text, world_id, user_session_id) VALUES (:user_id, :dt, :text, :world_id, :user_session_id)', {
            ':user_id':         player.session.user_id,
            ':dt':              ~~(Date.now() / 1000),
            ':text':            params.text,
            ':world_id':        this.world.info.id,
            ':user_session_id': 0
        });
        let chat_message_id = result.lastID;
        return chat_message_id;
    }

    // savePlayerInventory...
    async savePlayerInventory(player, params) {
        const result = await this.db.run('UPDATE user SET inventory = :inventory WHERE id = :id', {
            ':id':              player.session.user_id,
            ':inventory':       JSON.stringify(params)
        });
    }

    // savePlayerState...
    async savePlayerState(player) {
        player.position_changed = false;
        const result = await this.db.run('UPDATE user SET pos = :pos, rotate = :rotate, dt_moved = :dt_moved, indicators = :indicators, stats = :stats WHERE id = :id', {
            ':id':              player.session.user_id,
            ':pos':             JSON.stringify(player.state.pos),
            ':rotate':          JSON.stringify(player.state.rotate),
            ':indicators':      JSON.stringify(player.state.indicators),
            ':dt_moved':        ~~(Date.now() / 1000),
            ':stats':           JSON.stringify(player.state.stats),
        });
    }

    // changePosSpawn...
    async changePosSpawn(player, params) {
        await this.db.run('UPDATE user SET pos_spawn = :pos_spawn WHERE id = :id', {
            ':id':             player.session.user_id,
            ':pos_spawn':      JSON.stringify(params.pos)
        });
    }

    // changeRenderDist...
    async changeRenderDist(player, value) {
        await this.db.run('UPDATE user SET chunk_render_dist = :chunk_render_dist WHERE id = :id', {
            ':id':                  player.session.user_id,
            ':chunk_render_dist':   value
        });
    }

    // Вычитка списка администраторов
    async loadAdminList(world_id)  {
        let resp = [];
        let rows = await this.db.all('SELECT username FROM user WHERE is_admin = ?', [world_id]);
        for(let row of rows) {
            resp.push(row.username);
        }
        return resp;
    }

    // findPlayer...
    async findPlayer(world_id, username) {
        let row = await this.db.get("SELECT id, username FROM user WHERE lower(username) = LOWER(?)", [username]);
        if(!row) {
            return null;
        }
        return row;
    }

    // setAdmin...
    async setAdmin(world_id, user_id, is_admin) {
        let result = await this.db.get("UPDATE user SET is_admin = ? WHERE id = ?", [is_admin, user_id]);
    }

    // saveChestSlots...
    async saveChestSlots(chest) {
        let rows = await this.db.all('SELECT id, extra_data FROM world_modify WHERE x = :x AND y = :y AND z = :z ORDER BY id DESC LIMIT 1', {
            ':x': chest.pos.x,
            ':y': chest.pos.y,
            ':z': chest.pos.z
        });
        for(let row of rows) {
            let extra_data = row.extra_data ? JSON.parse(row.extra_data) : {};
            extra_data.slots = chest.slots;
            extra_data.can_destroy = !chest.slots || Object.entries(chest.slots).length == 0;
            await this.db.run('UPDATE world_modify SET extra_data = :extra_data WHERE id = :id', {
                ':extra_data':  JSON.stringify(extra_data),
                ':id':          row.id
            });
            return true;
        }
        return false;
    }

    // Chunk became modified
    async chunkBecameModified() {
        let resp = new Set();
        let rows = await this.db.all(`SELECT DISTINCT
            cast(x / ${CHUNK_SIZE_X} as int) - (x / ${CHUNK_SIZE_X} < cast(x / ${CHUNK_SIZE_X} as int)) AS x,
            cast(y / ${CHUNK_SIZE_Y} as int) - (y / ${CHUNK_SIZE_Y} < cast(y / ${CHUNK_SIZE_Y} as int)) AS y,
            cast(z / ${CHUNK_SIZE_Z} as int) - (z / ${CHUNK_SIZE_Z} < cast(z / ${CHUNK_SIZE_Z} as int)) AS z
        FROM world_modify`);
        for(let row of rows) {
            let addr = new Vector(row.x, row.y, row.z);
            resp.add(addr);
        }
        return resp
    }

    // Create entity (mob)
    async createMob(params) {
        const entity_id = uuid();
        const result = await this.db.run('INSERT INTO entity(dt, entity_id, type, skin, indicators, rotate, x, y, z, pos_spawn, extra_data) VALUES(:dt, :entity_id, :type, :skin, :indicators, :rotate, :x, :y, :z, :pos_spawn, :extra_data)', {
            ':dt':              ~~(Date.now() / 1000),
            ':entity_id':       entity_id,
            ':type':            params.type,
            ':skin':            params.skin,
            ':indicators':      JSON.stringify(params.indicators),
            ':rotate':          JSON.stringify(params.rotate),
            ':pos_spawn':       JSON.stringify(params.pos),
            ':extra_data':      params.extra_data ? JSON.stringify(params.extra_data) : null,
            ':x':               params.pos.x,
            ':y':               params.pos.y,
            ':z':               params.pos.z
        });
        return {
            id: result.lastID,
            entity_id: entity_id,
            is_active: 1
        };
    }

    // Create drop item
    async createDropItem(params) {
        const entity_id = uuid();
        const result = await this.db.run('INSERT INTO drop_item(dt, entity_id, items, x, y, z) VALUES(:dt, :entity_id, :items, :x, :y, :z)', {
            ':dt':              ~~(Date.now() / 1000),
            ':entity_id':       entity_id,
            ':items':           JSON.stringify(params.items),
            ':x':               params.pos.x,
            ':y':               params.pos.y,
            ':z':               params.pos.z
        });
        return {
            entity_id: entity_id
        };
    }

    // Delete drop item
    async deleteDropItem(entity_id) {
        const result = await this.db.run('UPDATE drop_item SET is_deleted = :is_deleted WHERE entity_id = :entity_id', {
            ':is_deleted': 1,
            ':entity_id': entity_id
        });
    }

    async setEntityActive(entity_id, value) {
        const result = await this.db.run('UPDATE entity SET is_active = :is_active WHERE entity_id = :entity_id', {
            ':is_active': value,
            ':entity_id': entity_id
        });
    }

    // Load mobs
    async loadMobs(addr, size) {
        let rows = await this.db.all('SELECT * FROM entity WHERE is_active = 1 AND x >= :x_min AND x < :x_max AND y >= :y_min AND y < :y_max AND z >= :z_min AND z < :z_max', {
            ':x_min': addr.x * size.x,
            ':x_max': addr.x * size.x + size.x,
            ':y_min': addr.y * size.y,
            ':y_max': addr.y * size.y + size.y,
            ':z_min': addr.z * size.z,
            ':z_max': addr.z * size.z + size.z
        });
        let resp = new Map();
        for(let row of rows) {
            let item = new Mob(this.world, {
                id:         row.id,
                rotate:     JSON.parse(row.rotate),
                pos_spawn:  JSON.parse(row.pos_spawn),
                pos:        new Vector(row.x, row.y, row.z),
                entity_id:  row.entity_id,
                type:       row.type,
                skin:       row.skin,
                extra_data: Mob.convertRowToExtraData(row),
                indicators: JSON.parse(row.indicators)
            });
            resp.set(item.id, item);
        }
        return resp;
    }

    // Save mob state
    async saveMob(mob) {
        const result = await this.db.run('UPDATE entity SET x = :x, y = :y, z = :z, indicators = :indicators, is_active = :is_active, extra_data = :extra_data WHERE entity_id = :entity_id', {
            ':x': mob.pos.x,
            ':y': mob.pos.y,
            ':z': mob.pos.z,
            ':entity_id': mob.entity_id,
            ':is_active': mob.indicators.live.value > 0 ? 1 : 0,
            ':extra_data': mob?.extra_data ? JSON.stringify(mob.extra_data) : null,
            ':indicators': JSON.stringify(mob.indicators)
        });
    }

    // Load drop items
    async loadDropItems(addr, size) {
        let rows = await this.db.all('SELECT * FROM drop_item WHERE is_deleted = 0 AND x >= :x_min AND x < :x_max AND y >= :y_min AND y < :y_max AND z >= :z_min AND z < :z_max', {
            ':x_min': addr.x * size.x,
            ':x_max': addr.x * size.x + size.x,
            ':y_min': addr.y * size.y,
            ':y_max': addr.y * size.y + size.y,
            ':z_min': addr.z * size.z,
            ':z_max': addr.z * size.z + size.z
        });
        let resp = new Map();
        for(let row of rows) {
            let item = new DropItem(this.world, {
                id:         row.id,
                pos:        new Vector(row.x, row.y, row.z),
                entity_id:  row.entity_id,
                items:      JSON.parse(row.items)
            });
            resp.set(item.entity_id, item);
        }
        return resp;
    }

    // Load chunk modify list
    async loadChunkModifiers(addr, size) {
        const mul = new Vector(10, 10, 10); // 116584
        let resp = new Map();
        let rows = await this.db.all("SELECT x, y, z, params, 1 as power, entity_id, extra_data, ticks FROM world_modify WHERE id IN (select max(id) FROM world_modify WHERE x >= :x_min AND x < :x_max AND y >= :y_min AND y < :y_max AND z >= :z_min AND z < :z_max group by x, y, z)", {
            ':x_min': addr.x * size.x,
            ':x_max': addr.x * size.x + size.x,
            ':y_min': addr.y * size.y,
            ':y_max': addr.y * size.y + size.y,
            ':z_min': addr.z * size.z,
            ':z_max': addr.z * size.z + size.z
        });
        for(let row of rows) {
            let params = row.params ? JSON.parse(row.params) : null;
            // @BlockItem
            let item = {
                id: params && ('id' in params) ? params.id : 0
            };
            if(item.id > 2) {
                if(row.ticks) {
                    item.ticks = row.ticks;
                }
                if('rotate' in params && params.rotate) {
                    if(BLOCK.fromId(item.id)?.can_rotate) {
                        item.rotate = new Vector(params.rotate).mul(mul).round().div(mul);
                    }
                }
                if('power' in params) {
                    item.power = params.power;
                }
                if('entity_id' in params && params.entity_id) {
                    item.entity_id = params.entity_id;
                }
                if(row.extra_data !== null) {
                    item.extra_data = JSON.parse(row.extra_data);
                }
            }
            //
            let pos = new Vector(row.x, row.y, row.z);
            resp.set(pos.toHash(), item);
        }
        return resp;
    }

    // Block set
    async blockSet(world, player, params) {
        let item = params.item;
        const is_modify = params.action_id == ServerClient.BLOCK_ACTION_MODIFY;
        if(item.id == 0) {
            item = null;
        } else {
            let material = BLOCK.fromId(item.id);
            if(!material) {
                throw 'error_block_not_found';
            }
            if(!material?.can_rotate && 'rotate' in item) {
                delete(item.rotate);
            }
            if('entity_id' in item && !item.entity_id) {
                delete(item.entity_id);
            }
            if('extra_data' in item && !item.extra_data) {
                delete(item.extra_data);
            }
            if('power' in item && item.power === 0) {
                delete(item.power);
            }
        }
        let need_insert = true;
        // console.log('db.setblock:', is_modify, params.pos.x, params.pos.y, params.pos.z);
        if(is_modify) {
            let rows = await this.db.all('SELECT id, extra_data FROM world_modify WHERE x = :x AND y = :y AND z = :z ORDER BY id DESC LIMIT 1', {
                ':x': params.pos.x,
                ':y': params.pos.y,
                ':z': params.pos.z
            });
            for(let row of rows) {
                need_insert = false;
                await this.db.run('UPDATE world_modify SET params = :params, entity_id = :entity_id, extra_data = :extra_data, block_id = :block_id WHERE id = :id', {
                    ':id':          row.id,
                    ':params':      item ? JSON.stringify(item) : null,
                    ':entity_id':   item?.entity_id ? item.entity_id : null,
                    ':extra_data':  item?.extra_data ? JSON.stringify(item.extra_data) : null,
                    ':block_id':    item?.id
                });
            }
        }
        if(need_insert) {
            await this.db.run('INSERT INTO world_modify(user_id, dt, world_id, params, x, y, z, entity_id, extra_data, block_id) VALUES (:user_id, :dt, :world_id, :params, :x, :y, :z, :entity_id, :extra_data, :block_id)', {
                ':user_id':     player?.session.user_id || null,
                ':dt':          ~~(Date.now() / 1000),
                ':world_id':    world.info.id,
                ':x':           params.pos.x,
                ':y':           params.pos.y,
                ':z':           params.pos.z,
                ':params':      item ? JSON.stringify(item) : null,
                ':entity_id':   item?.entity_id ? item.entity_id : null,
                ':extra_data':  item?.extra_data ? JSON.stringify(item.extra_data) : null,
                ':block_id':    item?.id
            });
        }
        if (item && 'extra_data' in item) {
            // @todo Update extra data
        }
    }

    // Change player game mode
    async changeGameMode(player, game_mode) {
        const result = await this.db.run('UPDATE user SET game_mode = :game_mode WHERE id = :id', {
            ':id':              player.session.user_id,
            ':game_mode':       game_mode
        });
    }

    //
    async loadQuest(quest_id) {
        // Quests
        let quest = null;
        // const quests = new Map();
        let rows = await this.db.all('SELECT id, quest_group_id, title, description FROM quest WHERE id = :quest_id', {
            ':quest_id': quest_id
        });
        for(let row of rows) {
            quest = {...row, actions: [], rewards: []};
            delete(quest.quest_group_id);
            // quests.set(quest.id, quest);
        }
        if(!quest) {
            return quest;
        }
        // Actions
        rows = await this.db.all('SELECT * FROM quest_action WHERE quest_id = :quest_id', {
            ':quest_id': quest_id
        });
        for(let row of rows) {
            const action = {...row};
            delete(action.quest_id);
            quest.actions.push(action);
        }
        // Rewards
        rows = await this.db.all('SELECT * FROM quest_reward WHERE quest_id = :quest_id', {
            ':quest_id': quest_id
        });
        for(let row of rows) {
            const reward = {...row};
            delete(reward.quest_id);
            quest.rewards.push(reward);
        }
        return quest;
    }

    // Return default quests with groups
    async loadDefaultQuests() {
        // Groups
        const groups = new Map();
        const group_rows = await this.db.all('SELECT * FROM quest_group', {});
        for(let row of group_rows) {
            const g = {...row, quests: []};
            groups.set(g.id, g);
        }
        // Quests
        const quests = new Map();
        let rows = await this.db.all('SELECT id, quest_group_id, title, description FROM quest WHERE is_default = 1', {});
        for(let row of rows) {
            const quest = {...row, actions: [], rewards: []};
            delete(quest.quest_group_id);
            let g = groups.get(row.quest_group_id);
            g.quests.push(quest);
            quests.set(quest.id, quest);
        }
        // Actions
        rows = await this.db.all('SELECT * FROM quest_action WHERE quest_id IN(SELECT id FROM quest WHERE is_default = 1)', {});
        for(let row of rows) {
            const action = {...row};
            delete(action.quest_id);
            let q = quests.get(row.quest_id);
            q.actions.push(action);
        }
        // Rewards
        rows = await this.db.all('SELECT * FROM quest_reward WHERE quest_id IN(SELECT id FROM quest WHERE is_default = 1)', {});
        for(let row of rows) {
            const reward = {...row};
            delete(reward.quest_id);
            let q = quests.get(row.quest_id);
            q.rewards.push(reward);
        }
        return Array.from(groups.values());
    }

    // questsUserStarted...
    async questsUserStarted(player) {
        let row = await this.db.get("SELECT * FROM user_quest WHERE user_id = :user_id", {
            ':user_id': player.session.user_id
        });
        if(!row) {
            return false;
        }
        return true;
    }

    // loadPlayerQuests...
    async loadPlayerQuests(player) {
        let rows = await this.db.all(`SELECT
                q.id,
                q.quest_group_id,
                q.title,
                q.description,
                q.next_quests,
                uq.is_completed,
                uq.in_progress,
                uq.actions,
                json_object('id', g.id, 'title', g.title) AS quest_group,
                (SELECT json_group_array(json_object('block_id', block_id, 'cnt', cnt)) FROM quest_reward qr WHERE qr.quest_id = q.id) AS rewards
            FROM user_quest uq
            left join quest q on q.id = uq.quest_id
            left join quest_group g on g.id = q.quest_group_id
            WHERE user_id = :user_id`, {
            ':user_id': player.session.user_id,
        });
        const resp = [];
        for(let row of rows) {
            row.actions         = JSON.parse(row.actions);
            row.quest_group     = JSON.parse(row.quest_group);
            row.rewards         = JSON.parse(row.rewards);
            row.is_completed    = row.is_completed != 0;
            row.in_progress     = !row.is_completed && row.in_progress != 0;
            resp.push(row);
        }
        return resp;
    }

    // savePlayerQuest...
    async savePlayerQuest(player, quest) {
        const exist_row = await this.db.get('SELECT * FROM user_quest WHERE user_id = :user_id AND quest_id = :quest_id', {
            ':user_id':             player.session.user_id,
            ':quest_id':            quest.id
        });
        if(exist_row) {
            await this.db.run('UPDATE user_quest SET actions = :actions, is_completed = :is_completed, in_progress = :in_progress WHERE user_id = :user_id AND quest_id = :quest_id', {
                ':user_id':         player.session.user_id,
                ':quest_id':        quest.id,
                ':is_completed':    quest.is_completed ? 1 : 0,
                ':in_progress':     quest.in_progress ? 1 : 0,
                ':actions':         JSON.stringify(quest.actions)
            });
        } else {
            await this.db.run('INSERT INTO user_quest(dt, user_id, quest_id, is_completed, in_progress, actions) VALUES (:dt, :user_id, :quest_id, :is_completed, :in_progress, :actions)', {
                ':dt':              ~~(Date.now() / 1000),
                ':user_id':         player.session.user_id,
                ':quest_id':        quest.id,
                ':is_completed':    quest.is_completed ? 1 : 0,
                ':in_progress':     quest.in_progress ? 1 : 0,
                ':actions':         JSON.stringify(quest.actions)
            });
        }
    }

    // chunkMobsIsGenerated...
    async chunkMobsIsGenerated(chunk_addr_hash) {
        let row = await this.db.get("SELECT * FROM chunk WHERE addr = :addr", {
            ':addr': chunk_addr_hash
        });
        if(!row) {
            return false;
        }
        return !!row['mobs_is_generated'];
    }

    // chunkMobsSetGenerated...
    async chunkMobsSetGenerated(chunk_addr_hash, mobs_is_generated) {
        let exist_row = await this.db.get("SELECT * FROM chunk WHERE addr = :addr", {
            ':addr': chunk_addr_hash
        });
        if(exist_row) {
            await this.db.run('UPDATE chunk SET mobs_is_generated = :mobs_is_generated WHERE addr = :addr', {
                ':addr':                chunk_addr_hash,
                ':mobs_is_generated':   mobs_is_generated
            });
        } else {
            await this.db.run('INSERT INTO chunk(dt, addr, mobs_is_generated) VALUES (:dt, :addr, :mobs_is_generated)', {
                ':dt':                  ~~(Date.now() / 1000),
                ':addr':                chunk_addr_hash,
                ':mobs_is_generated':   mobs_is_generated
            });
        }

    }

    /**
     * TO DO EN список точек для телепортации
     * @param {number} id id игрока
     * @return {Object} список доступных точек для телепортации
     */
    async getListTeleportPoints(id) {
        let rows = await this.db.all("SELECT title, x, y, z FROM teleport_points WHERE user_id = :id ", {
            ":id" : parseInt(id)
        });
        if(!rows) {
            return null;
        }
        return rows;
    }

    /**
     * TO DO EN получает коодинаты точки игрока с именем title
     * @param {number} id id тгрока
     * @param {string} title имя точки
     */
    async getTeleportPoint(id, title) {
        let clear_title = title.replace(/[^a-z0-9\s]/gi, '').substr(0, 50);
        let row = await this.db.get("SELECT x, y, z FROM teleport_points WHERE user_id = :id AND title=:title ", {
            ":id" : parseInt(id),
            ":title": clear_title
        });
        if(!row) {
            return null;
        }
        return row;
    }

    /**
     * TO DO EN добавлят положение игрока в список с именем title
     * @param {number} id id игрока
     * @param {string} title имя точки
     * @param {number} x x точки
     * @param {number} y y точки
     * @param {number} z z точки
     */
    async addTeleportPoint(id, title, x, y, z) {
        let clear_title = title.replace(/[^a-z0-9\s]/gi, '').substr(0, 50);
        await this.db.run("INSERT INTO teleport_points (user_id, title, x, y, z) VALUES (:id, :title, :x, :y, :z)", {
            ":id" : parseInt(id),
            ":title": clear_title,
            ":x": x,
            ":y": y + 0.5,
            ":z": z
        });
    }
    
    async getPlayerInfo(user_id) {
        const row = await this.db.get("SELECT * FROM user WHERE id=:id", {
            ":id": parseInt(user_id)
        });
        
        let result = {};
        if (row) {
            result.id = row.id;
            result.username = row.username;
            result.inventory = JSON.parse(row.inventory);
            result.stats = JSON.parse(row.stats);
            result.indicators = JSON.parse(row.indicators);
        }
        
        return result;
    }

}