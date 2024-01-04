/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { Colors } from 'react-native/Libraries/NewAppScreen';
import { SuiteResult, runSuites } from './tests/suiteMochaCompat';
import { tests } from './tests/tests';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  const [results, setResults] = useState([] as SuiteResult[]);

  useEffect(() => {
    runSuites([tests], x => {
      console.log('x', x);
    }).then(x => {
      setResults(x);
    });
  }, []);

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={backgroundStyle}>
        <View>
          <Text>
            {results.every(x => x.success)
              ? '🧘 All tests passed'
              : '🤨 Some tests failed'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default App;
