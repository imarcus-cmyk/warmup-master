import 'dotenv/config';
import { App } from '@slack/bolt';

import {
  answerWarmupQuestion,
  helpText,
  looksLikeActionRequest,
} from './history.js';
import { runActionRequest } from './worker.js';

const {
  SLACK_BOT_TOKEN,
  SLACK_APP_TOKEN,
  SLACK_AGENT_CHANNEL_ID,
} = process.env;

function requiredEnv(name, value) {
  if (!value) throw new Error(`missing ${name}`);
}

requiredEnv('SLACK_BOT_TOKEN', SLACK_BOT_TOKEN);
requiredEnv('SLACK_APP_TOKEN', SLACK_APP_TOKEN);
requiredEnv('SLACK_AGENT_CHANNEL_ID', SLACK_AGENT_CHANNEL_ID);

const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  socketMode: true,
});

function stripMention(text) {
  return String(text || '').replace(/<@[^>]+>/g, '').trim();
}

async function postInChannel(client, event, text) {
  await client.chat.postMessage({
    channel: event.channel,
    text,
    unfurl_links: false,
  });
}

async function answerText(text) {
  if (looksLikeActionRequest(text)) {
    // Delegate to the "Warmup social profiles" worker: it resolves the named
    // actor profile, opens the GoLogin browser, runs the targeted actions, and
    // returns a summary the manager posts back here.
    const { message } = await runActionRequest(text);
    return message;
  }
  return answerWarmupQuestion(text);
}

app.event('app_mention', async ({ event, client, logger }) => {
  try {
    if (event.channel !== SLACK_AGENT_CHANNEL_ID) return;
    const text = stripMention(event.text);
    if (looksLikeActionRequest(text)) {
      await postInChannel(client, event, ':hourglass_flowing_sand: On it — handing this to Warmup social profiles…');
    }
    await postInChannel(client, event, await answerText(text));
  } catch (err) {
    logger.error(err);
    await postInChannel(client, event, `I hit an error while checking warmup history: ${err.message}`);
  }
});

app.command('/warmup', async ({ ack, command, client, logger }) => {
  await ack();
  try {
    if (command.channel_id !== SLACK_AGENT_CHANNEL_ID) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: 'Use `/warmup` in the warmup-agent channel so reports stay clean.',
      });
      return;
    }

    const text = command.text?.trim();
    if (text && looksLikeActionRequest(text)) {
      await client.chat.postMessage({
        channel: command.channel_id,
        text: ':hourglass_flowing_sand: On it — handing this to Warmup social profiles…',
        unfurl_links: false,
      });
    }
    const answer = text ? await answerText(text) : helpText();
    await client.chat.postMessage({
      channel: command.channel_id,
      text: answer,
      unfurl_links: false,
    });
  } catch (err) {
    logger.error(err);
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: `I hit an error while answering: ${err.message}`,
    });
  }
});

await app.start();
console.log(`Warmup Agent listening in ${SLACK_AGENT_CHANNEL_ID}`);
