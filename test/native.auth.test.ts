
import { UserSigner } from "@multiversx/erdjs-walletcore";
import { SignableMessage } from "@multiversx/erdjs";
import axios from "axios";
import MockAdapter, { RequestHandler } from "axios-mock-adapter";
import { NativeAuthHostNotAcceptedError } from "../src/entities/errors/native.auth.host.not.accepted.error";
import { NativeAuthInvalidBlockHashError } from "../src/entities/errors/native.auth.invalid.block.hash.error";
import { NativeAuthInvalidSignatureError } from "../src/entities/errors/native.auth.invalid.signature.error";
import { NativeAuthTokenExpiredError } from "../src/entities/errors/native.auth.token.expired.error";
import { NativeAuthDecoded } from "../src/entities/native.auth.decoded";
import { NativeAuthResult } from "../src/entities/native.auth.validate.result";
import { NativeAuthClient } from "../src/native.auth.client";
import { NativeAuthServer } from "../src/native.auth.server";

describe("Native Auth", () => {
  let mock: MockAdapter;
  const ADDRESS =
    'erd1qnk2vmuqywfqtdnkmauvpm8ls0xh00k8xeupuaf6cm6cd4rx89qqz0ppgl';
  const HOST = 'api.multiversx.com';
  const SIGNATURE =
    'efbe8fd1132942a628e5681535d6e1c7b53344568520cff2f504123dfb7bfc2ef551966d4cf5dcd2cabbea690bc542c7de0731d35fbafaee3c32e09475edb105';
  const BLOCK_HASH =
    'fbd590696859076769bbf9127e8ca1a4ee0886ac0a8b7c423935be649ca6cfb1';
  const TTL = 86400;
  const TOKEN = `YXBpLm11bHRpdmVyc3guY29t.${BLOCK_HASH}.${TTL}.e30`;
  const ACCESS_TOKEN =
    'ZXJkMXFuazJ2bXVxeXdmcXRkbmttYXV2cG04bHMweGgwMGs4eGV1cHVhZjZjbTZjZDRyeDg5cXF6MHBwZ2w.WVhCcExtMTFiSFJwZG1WeWMzZ3VZMjl0LmZiZDU5MDY5Njg1OTA3Njc2OWJiZjkxMjdlOGNhMWE0ZWUwODg2YWMwYThiN2M0MjM5MzViZTY0OWNhNmNmYjEuODY0MDAuZTMw.efbe8fd1132942a628e5681535d6e1c7b53344568520cff2f504123dfb7bfc2ef551966d4cf5dcd2cabbea690bc542c7de0731d35fbafaee3c32e09475edb105';
  const BLOCK_TIMESTAMP = 1673350224;

  const PEM_KEY = `-----BEGIN PRIVATE KEY for erd1qnk2vmuqywfqtdnkmauvpm8ls0xh00k8xeupuaf6cm6cd4rx89qqz0ppgl-----
  ODY1NmI0ZjMzYTRjOTY0MGI3MTFiY2E4NDUzODNiMDZiNjczMjAzNjk2ZjYxYjMy
  N2E5MDY3ODdlNWExODg1NjA0ZWNhNjZmODAyMzkyMDViNjc2ZGY3OGMwZWNmZjgz
  Y2Q3N2JlYzczNjc4MWU3NTNhYzZmNTg2ZDQ2NjM5NDA=
  -----END PRIVATE KEY for erd1qnk2vmuqywfqtdnkmauvpm8ls0xh00k8xeupuaf6cm6cd4rx89qqz0ppgl-----`;
  const PEM_ADDRESS =
    'erd1qnk2vmuqywfqtdnkmauvpm8ls0xh00k8xeupuaf6cm6cd4rx89qqz0ppgl';

  const onLatestBlockHashGet = function (mock: MockAdapter): RequestHandler {
    return mock.onGet('https://api.multiversx.com/blocks?size=1&fields=hash');
  };

  const onLatestBlockTimestampGet = function (
    mock: MockAdapter
  ): RequestHandler {
    return mock.onGet(
      'https://api.multiversx.com/blocks?size=1&fields=timestamp'
    );
  };

  const onSpecificBlockTimestampGet = function (
    mock: MockAdapter
  ): RequestHandler {
    return mock.onGet(
      `https://api.multiversx.com/blocks/${BLOCK_HASH}?extract=timestamp`
    );
  };

  beforeAll(() => {
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    mock.reset();
  });

  describe("Client", () => {
    it("Latest block should return signable token", async () => {
      const client = new NativeAuthClient({
        host: HOST,
      });

      onLatestBlockHashGet(mock).reply(200, [{ hash: BLOCK_HASH }]);

      const token = await client.initialize();

      expect(token).toStrictEqual(TOKEN);
    });

    it("Internal server error", async () => {
      const client = new NativeAuthClient();

      onLatestBlockHashGet(mock).reply(500);

      await expect(client.initialize()).rejects.toThrow();
    });

    it('Generate Access token', () => {
      const client = new NativeAuthClient();

      const accessToken = client.getToken(
        ADDRESS,
        TOKEN,
        SIGNATURE
      );

      expect(accessToken).toStrictEqual(ACCESS_TOKEN);
    });
  });

  describe('Server', () => {
    it('Simple decode', async () => {
      const server = new NativeAuthServer();

      onSpecificBlockTimestampGet(mock).reply(200, BLOCK_TIMESTAMP);
      onLatestBlockTimestampGet(mock).reply(200, [{ timestamp: BLOCK_TIMESTAMP }]);

      const result = await server.decode(ACCESS_TOKEN);

      expect(result).toStrictEqual(new NativeAuthDecoded({
        address: ADDRESS,
        ttl: TTL,
        host: HOST,
        blockHash: BLOCK_HASH,
        signature: SIGNATURE,
        body: TOKEN,
      }));
    });

    it('Simple validation for current timestamp', async () => {
      const server = new NativeAuthServer();

      onSpecificBlockTimestampGet(mock).reply(200, BLOCK_TIMESTAMP);
      onLatestBlockTimestampGet(mock).reply(200, [{ timestamp: BLOCK_TIMESTAMP }]);

      const result = await server.validate(ACCESS_TOKEN);

      expect(result).toStrictEqual(new NativeAuthResult({
        address: ADDRESS,
        issued: BLOCK_TIMESTAMP,
        expires: BLOCK_TIMESTAMP + TTL,
        host: HOST,
      }));
    });

    it('Latest possible timestamp validation', async () => {
      const server = new NativeAuthServer();

      onSpecificBlockTimestampGet(mock).reply(200, BLOCK_TIMESTAMP);
      onLatestBlockTimestampGet(mock).reply(200, [{ timestamp: BLOCK_TIMESTAMP + TTL }]);

      const result = await server.validate(ACCESS_TOKEN);

      expect(result).toStrictEqual(new NativeAuthResult({
        address: ADDRESS,
        issued: BLOCK_TIMESTAMP,
        expires: BLOCK_TIMESTAMP + TTL,
        host: HOST,
      }));
    });

    it('Host should be accepted', async () => {
      const server = new NativeAuthServer({
        acceptedHosts: [HOST],
      });

      onSpecificBlockTimestampGet(mock).reply(200, BLOCK_TIMESTAMP);
      onLatestBlockTimestampGet(mock).reply(200, [{ timestamp: BLOCK_TIMESTAMP }]);

      const result = await server.validate(ACCESS_TOKEN);

      expect(result).toStrictEqual(new NativeAuthResult({
        address: ADDRESS,
        issued: BLOCK_TIMESTAMP,
        expires: BLOCK_TIMESTAMP + TTL,
        host: HOST,
      }));
    });

    it('Unsupported host should not be accepted', async () => {
      const server = new NativeAuthServer({
        acceptedHosts: ['other-host'],
      });

      onSpecificBlockTimestampGet(mock).reply(200, BLOCK_TIMESTAMP);
      onLatestBlockTimestampGet(mock).reply(200, [{ timestamp: BLOCK_TIMESTAMP }]);

      await expect(server.validate(ACCESS_TOKEN)).rejects.toThrow(NativeAuthHostNotAcceptedError);
    });

    it('Block hash not found should not be accepted', async () => {
      const server = new NativeAuthServer();

      onSpecificBlockTimestampGet(mock).reply(404);

      await expect(server.validate(ACCESS_TOKEN)).rejects.toThrow(NativeAuthInvalidBlockHashError);
    });

    it('Block hash unexpected error should throw', async () => {
      const server = new NativeAuthServer();

      onSpecificBlockTimestampGet(mock).reply(500);

      await expect(server.validate(ACCESS_TOKEN)).rejects.toThrow('Request failed with status code 500');
    });

    it('Latest block + ttl + 1 should throw expired error', async () => {
      const server = new NativeAuthServer();

      onSpecificBlockTimestampGet(mock).reply(200, BLOCK_TIMESTAMP);
      onLatestBlockTimestampGet(mock).reply(200, [{ timestamp: BLOCK_TIMESTAMP + TTL + 1 }]);

      await expect(server.validate(ACCESS_TOKEN)).rejects.toThrow(NativeAuthTokenExpiredError);
    });

    it('Invalid signature should throw error', async () => {
      const server = new NativeAuthServer();

      onSpecificBlockTimestampGet(mock).reply(200, BLOCK_TIMESTAMP);
      onLatestBlockTimestampGet(mock).reply(200, [{ timestamp: BLOCK_TIMESTAMP }]);

      await expect(server.validate(ACCESS_TOKEN + 'abbbbbbbbb')).rejects.toThrow(NativeAuthInvalidSignatureError);
    });

    it('Cache hit', async () => {
      const server = new NativeAuthServer();

      server.config.cache = {
        // eslint-disable-next-line require-await
        getValue: async function <T>(key: string): Promise<T | undefined> {
          if (key === `block:timestamp:${BLOCK_HASH}`) {
            // @ts-ignore
            return BLOCK_TIMESTAMP;
          }

          if (key === 'block:timestamp:latest') {
            // @ts-ignore
            return BLOCK_TIMESTAMP;
          }

          throw new Error(`Key '${key}' not mocked`);
        },
        setValue: async function <T>(key: string, value: T, ttl: number): Promise<void> {

        },
      };

      const result = await server.validate(ACCESS_TOKEN);

      expect(result).toStrictEqual(new NativeAuthResult({
        address: ADDRESS,
        issued: BLOCK_TIMESTAMP,
        expires: BLOCK_TIMESTAMP + TTL,
        host: HOST,
      }));
    });

    it('Cache miss', async () => {
      const server = new NativeAuthServer();

      server.config.cache = {
        // eslint-disable-next-line require-await
        getValue: async function <T>(key: string): Promise<T | undefined> {
          return undefined;
        },
        setValue: async function <T>(key: string, value: T, ttl: number): Promise<void> {

        },
      };

      onSpecificBlockTimestampGet(mock).reply(200, BLOCK_TIMESTAMP);
      onLatestBlockTimestampGet(mock).reply(200, [{ timestamp: BLOCK_TIMESTAMP }]);

      const result = await server.validate(ACCESS_TOKEN);

      expect(result).toStrictEqual(new NativeAuthResult({
        address: ADDRESS,
        issued: BLOCK_TIMESTAMP,
        expires: BLOCK_TIMESTAMP + TTL,
        host: HOST,
      }));
    });
  });

  describe('Client & Server', () => {
    it('End-to-end with internal pem', async () => {
      const client = new NativeAuthClient({
        host: HOST,
      });

      onLatestBlockHashGet(mock).reply(200, [{ hash: BLOCK_HASH }]);

      const pem = UserSigner.fromPem(PEM_KEY);

      const signableToken = await client.initialize();

      const messageToSign = `${PEM_ADDRESS}${signableToken}{}`;
      const signableMessage = new SignableMessage({
        message: Buffer.from(messageToSign, 'utf8'),
      });
      await pem.sign(signableMessage);

      const signature = signableMessage.getSignature();

      const accessToken = client.getToken(PEM_ADDRESS, signableToken, signature.hex());

      const server = new NativeAuthServer();

      onSpecificBlockTimestampGet(mock).reply(200, BLOCK_TIMESTAMP);
      onLatestBlockTimestampGet(mock).reply(200, [{ timestamp: BLOCK_TIMESTAMP }]);

      const result = await server.validate(accessToken);

      expect(result).toStrictEqual(new NativeAuthResult({
        address: PEM_ADDRESS,
        issued: BLOCK_TIMESTAMP,
        expires: BLOCK_TIMESTAMP + TTL,
        host: HOST,
      }));
    });

    it('End-to-end with internal pem and extra info', async () => {
      const client = new NativeAuthClient({
        host: HOST,
      });

      onLatestBlockHashGet(mock).reply(200, [{ hash: BLOCK_HASH }]);

      const pem = UserSigner.fromPem(PEM_KEY);

      const signableToken = await client.initialize({
        hello: 'world',
      });

      const messageToSign = `${PEM_ADDRESS}${signableToken}{}`;
      const signableMessage = new SignableMessage({
        message: Buffer.from(messageToSign, 'utf8'),
      });
      await pem.sign(signableMessage);

      const signature = signableMessage.getSignature();

      const accessToken = client.getToken(PEM_ADDRESS, signableToken, signature.hex());

      const server = new NativeAuthServer();

      onSpecificBlockTimestampGet(mock).reply(200, BLOCK_TIMESTAMP);
      onLatestBlockTimestampGet(mock).reply(200, [{ timestamp: BLOCK_TIMESTAMP }]);

      const result = await server.validate(accessToken);

      expect(result).toStrictEqual(new NativeAuthResult({
        address: PEM_ADDRESS,
        issued: BLOCK_TIMESTAMP,
        expires: BLOCK_TIMESTAMP + TTL,
        host: HOST,
        extraInfo: {
          hello: 'world',
        },
      }));
    });
  });
});
