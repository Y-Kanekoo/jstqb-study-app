import { getStateFromPath } from 'expo-router/build/react-navigation/core/getStateFromPath';
import { getPathFromState as coreGetPathFromState } from 'expo-router/build/react-navigation/core/getPathFromState';
import { getPathFromState } from 'expo-router/build/fork/getPathFromState';
import { appendQueryAndHash } from 'expo-router/build/fork/getPathFromState-forks';
import fixtures from './uri-query-contract.json';

const screens = { screens: { practice: 'practice/:sessionId' } };
const params = { sessionId: 'synthetic', tag: ['a', 'b'], q: '日本 +', empty: '' };
globalThis.__uriQueryResults = {
  parsed: fixtures.parse.filter(f => !f.options).map(f => getStateFromPath(`/practice/synthetic?${f.input}`, screens).routes[0].params),
  generated: getPathFromState({ routes: [{ name: 'practice', params }] }, screens),
  coreGenerated: coreGetPathFromState({ routes: [{ name: 'practice', params: { sessionId: 'synthetic', q: '日本 +', empty: '' } }] }, screens),
  withHash: appendQueryAndHash('/practice/synthetic', { q: 'a+b', '#': 'section' }),
  large: getStateFromPath(`/practice/synthetic?q=${'%FE'.repeat(20000)}`, screens).routes[0].params.q,
};
