import Anthropic from '@anthropic-ai/sdk'
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { ClaudeProvider, type ClaudeModels } from '../core/providers/claude'
import { TranscribeSTT, type AwsCredentials } from '../core/providers/transcribe'
import type { Lang } from '../core/types'
import type { Connections } from '../shared/ipc'

// API keys and AWS credentials live only in this module's memory. They are
// never written to disk, never sent to the window, and are gone when the app
// quits, so the user enters them again on every start.

let anthropicKey: string | undefined
let anthropicLabel = ''
let aws: AwsCredentials | undefined
let awsLabel = ''

const mask = (s: string) => (s.length > 12 ? `${s.slice(0, 7)}…${s.slice(-4)}` : '…')

function message(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'The key was rejected (401). Check that you copied all of it.'
  if (err instanceof Anthropic.PermissionDeniedError) return 'The key has no access to this model (403).'
  if (err instanceof Anthropic.APIConnectionError) return 'No connection to the Anthropic API. Check the internet connection.'
  if (err instanceof Anthropic.APIError) return `${err.status ?? ''} ${err.message}`.trim()
  return err instanceof Error ? err.message : String(err)
}

export function connections(): Connections {
  return {
    anthropic: { connected: !!anthropicKey, label: anthropicLabel },
    aws: { connected: !!aws, label: awsLabel, region: aws?.region ?? '' }
  }
}

export async function connectAnthropic(key: string): Promise<Connections> {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('Enter an API key.')
  const client = new Anthropic({ apiKey: trimmed, maxRetries: 1, timeout: 15_000 })
  try {
    // Free call that proves the key works and can see the models we use.
    await client.models.retrieve('claude-haiku-5-5')
  } catch (err) {
    throw new Error(message(err))
  }
  anthropicKey = trimmed
  anthropicLabel = mask(trimmed)
  return connections()
}

export async function connectAws(creds: AwsCredentials): Promise<Connections> {
  const c: AwsCredentials = {
    accessKeyId: creds.accessKeyId.trim(),
    secretAccessKey: creds.secretAccessKey.trim(),
    sessionToken: creds.sessionToken?.trim() || undefined,
    region: creds.region
  }
  if (!c.accessKeyId || !c.secretAccessKey) throw new Error('Enter the access key ID and the secret access key.')
  const sts = new STSClient({ region: c.region, credentials: c })
  try {
    const id = await sts.send(new GetCallerIdentityCommand({}))
    awsLabel = `${id.Arn ?? id.Account ?? 'AWS'}`
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  } finally {
    sts.destroy()
  }
  aws = c
  return connections()
}

export function disconnect(kind: 'anthropic' | 'aws'): Connections {
  if (kind === 'anthropic') {
    anthropicKey = undefined
    anthropicLabel = ''
  } else {
    aws = undefined
    awsLabel = ''
  }
  return connections()
}

/** The Claude provider for the chosen route, or undefined when it is not connected. */
export function claudeProvider(route: 'anthropic' | 'bedrock', models: ClaudeModels): ClaudeProvider | undefined {
  if (route === 'anthropic' && anthropicKey) {
    return new ClaudeProvider('anthropic', new Anthropic({ apiKey: anthropicKey, maxRetries: 2, timeout: 30_000 }), models)
  }
  if (route === 'bedrock' && aws) {
    const client = new AnthropicBedrockMantle({
      awsRegion: aws.region,
      awsAccessKey: aws.accessKeyId,
      awsSecretAccessKey: aws.secretAccessKey,
      awsSessionToken: aws.sessionToken ?? null,
      maxRetries: 2,
      timeout: 30_000
    })
    return new ClaudeProvider('bedrock', client, models)
  }
  return undefined
}

export function transcribe(callLang: 'auto' | Lang): TranscribeSTT | undefined {
  return aws ? new TranscribeSTT(aws, callLang) : undefined
}
