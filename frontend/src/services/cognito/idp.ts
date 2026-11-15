/**
 * Minimal client for the public (unauthenticated) Cognito user pool API used for
 * self-registration: SignUp, ConfirmSignUp, ResendConfirmationCode.
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/
 *
 * These operations need no AWS credentials and no client secret (public SPA client),
 * so a plain `fetch` is enough and the AWS SDK / Amplify are not required.
 */

export class CognitoError extends Error {
  /** Cognito exception name, e.g. `UsernameExistsException`; `NetworkError` if unreachable. */
  readonly type: string

  constructor(type: string, message: string) {
    super(message)
    this.name = 'CognitoError'
    this.type = type
  }
}

const FRIENDLY: Record<string, string> = {
  UsernameExistsException:
    'An account with this e-mail address already exists. Sign in instead, or enter the verification code you received.',
  InvalidPasswordException: 'The password does not meet the password policy shown below the field.',
  InvalidParameterException: 'Cognito rejected the input. Check the e-mail address and the password.',
  CodeMismatchException: 'That verification code is not correct. Check it and try again.',
  ExpiredCodeException: 'That verification code has expired. Request a new code.',
  LimitExceededException: 'Too many attempts. Wait a few minutes before trying again.',
  TooManyRequestsException: 'Too many requests. Wait a moment and try again.',
  TooManyFailedAttemptsException: 'Too many failed attempts. Wait a few minutes before trying again.',
  UserNotFoundException: 'No account was found for this e-mail address.',
  NotAuthorizedException:
    'This account cannot be confirmed - it may already be confirmed. Try signing in.',
  CodeDeliveryFailureException: 'The verification e-mail could not be sent. Try again later.',
  UserLambdaValidationException: 'Registration was rejected by the user pool.',
  ResourceNotFoundException:
    'The Cognito app client was not found. Check VITE_COGNITO_CLIENT_ID and VITE_AWS_REGION.',
  NetworkError: 'Cognito could not be reached. Check your connection and try again.',
}

export function friendlyCognitoMessage(type: string): string {
  return FRIENDLY[type] ?? `Registration failed (${type}). Please try again.`
}

export interface SignUpResult {
  userConfirmed: boolean
  /** Masked destination of the verification code, e.g. `a***@e***.com`. */
  codeDestination: string | null
}

export interface CognitoIdp {
  signUp(email: string, password: string): Promise<SignUpResult>
  confirmSignUp(email: string, code: string): Promise<void>
  resendConfirmationCode(email: string): Promise<{ codeDestination: string | null }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function destinationOf(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.CodeDeliveryDetails)) return null
  const destination = body.CodeDeliveryDetails.Destination
  return typeof destination === 'string' ? destination : null
}

export function createCognitoIdp(deps: {
  region: string
  clientId: string
  fetchImpl?: typeof fetch
}): CognitoIdp {
  const endpoint = `https://cognito-idp.${deps.region}.amazonaws.com/`

  async function call(target: string, payload: Record<string, unknown>): Promise<unknown> {
    let response: Response
    let body: unknown
    try {
      response = await (deps.fetchImpl ?? globalThis.fetch)(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
        },
        body: JSON.stringify(payload),
        credentials: 'omit',
        cache: 'no-store',
      })
      const text = await response.text()
      body = text ? (JSON.parse(text) as unknown) : null
    } catch {
      throw new CognitoError('NetworkError', friendlyCognitoMessage('NetworkError'))
    }
    if (!response.ok) {
      const raw = isRecord(body) && typeof body.__type === 'string' ? body.__type : 'UnknownError'
      // Some responses use the qualified form "com.amazonaws...#CodeMismatchException".
      const type = raw.includes('#') ? raw.slice(raw.lastIndexOf('#') + 1) : raw
      throw new CognitoError(type, friendlyCognitoMessage(type))
    }
    return body
  }

  return {
    async signUp(email, password) {
      const username = email.trim().toLowerCase()
      const body = await call('SignUp', {
        ClientId: deps.clientId,
        Username: username,
        Password: password,
        UserAttributes: [{ Name: 'email', Value: username }],
      })
      return {
        userConfirmed: isRecord(body) && body.UserConfirmed === true,
        codeDestination: destinationOf(body),
      }
    },
    async confirmSignUp(email, code) {
      await call('ConfirmSignUp', {
        ClientId: deps.clientId,
        Username: email.trim().toLowerCase(),
        ConfirmationCode: code.trim(),
      })
    },
    async resendConfirmationCode(email) {
      const body = await call('ResendConfirmationCode', {
        ClientId: deps.clientId,
        Username: email.trim().toLowerCase(),
      })
      return { codeDestination: destinationOf(body) }
    },
  }
}
