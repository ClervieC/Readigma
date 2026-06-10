import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius, shadows } from '../theme';
import { useAuth } from '../contexts/auth.context';

import DiscoverScreen from '../screens/DiscoverScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SearchScreen from '../screens/SearchScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import BookDetailScreen from '../screens/BookDetailScreen';
import GoalScreen from '../screens/GoalScreen';
import FeedScreen from '../screens/FeedScreen';
import FriendsScreen from '../screens/FriendsScreen';
import SuggestBookScreen from '../screens/SuggestBookScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import HelpScreen from '../screens/HelpScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TABS = [
  { name: 'Discover', label: 'Découvrir', icon: '✦' },
  { name: 'Feed',     label: 'Fil',       icon: '◈' },
  { name: 'Biblio',   label: 'Biblio',    icon: '⊞' },
  { name: 'Chercher', label: 'Chercher',  icon: '◎' },
  { name: 'Profil',   label: 'Profil',    icon: '◉' },
];

function CustomTabBar({ state, navigation }: any) {
  return (
    <View style={tabStyles.wrapper}>
      <View style={tabStyles.bar}>
        {state.routes.map((route: any, index: number) => {
          const tab = TABS.find(t => t.name === route.name) ?? TABS[index];
          const focused = state.index === index;

          return (
            <TouchableOpacity
              key={route.key}
              style={tabStyles.item}
              onPress={() => navigation.navigate(route.name)}
              activeOpacity={0.7}
            >
              <View style={[tabStyles.iconWrap, focused && tabStyles.iconWrapActive]}>
                <Text style={[tabStyles.icon, focused && tabStyles.iconActive]}>
                  {tab.icon}
                </Text>
              </View>
              <Text style={[tabStyles.label, focused && tabStyles.labelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 28,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingVertical: 10,
    paddingHorizontal: 6,
    ...shadows.card,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 38,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.purpleGlow,
  },
  icon: {
    fontSize: 18,
    color: colors.gray,
  },
  iconActive: {
    color: colors.lavender,
  },
  label: {
    fontSize: 9,
    color: colors.gray,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  labelActive: {
    color: colors.lavender,
    fontWeight: '700',
  },
});

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Biblio" component={LibraryScreen} />
      <Tab.Screen name="Chercher" component={SearchScreen} />
      <Tab.Screen name="Profil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="BookDetail" component={BookDetailScreen} />
      <Stack.Screen name="Goal" component={GoalScreen} />
      <Stack.Screen name="Friends" component={FriendsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="SuggestBook" component={SuggestBookScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
    </Stack.Navigator>
  );
}

export default function Navigation() {
  const { isLoggedIn, needsOnboarding, login, completeOnboarding } = useAuth();

  if (isLoggedIn === null) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isLoggedIn ? (
          needsOnboarding ? (
            <Stack.Screen name="Onboarding">
              {(props) => <OnboardingScreen {...props} onDone={completeOnboarding} />}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="Main" component={MainStack} />
          )
        ) : (
          <>
            <Stack.Screen name="Login">
              {(props) => <LoginScreen {...props} onLogin={login} />}
            </Stack.Screen>
            <Stack.Screen name="Register">
              {(props) => <RegisterScreen {...props} onLogin={login} />}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
