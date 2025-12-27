// Jungle-Assistant Unity Bridge
// Auto-generated editor utility for safe project settings modification
// DO NOT EDIT MANUALLY - This file is managed by Jungle-Assistant

#if UNITY_EDITOR
using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;

namespace Squido.JungleXRKit.Assistant.UnityBridge
{
    /// <summary>
    /// Unity Bridge for Jungle-Assistant - Provides safe executeMethod entry points for project settings modification
    /// </summary>
    public static class JungleAssistantUnityBridge
    {
        private const string LOG_PREFIX = "[Jungle-Assistant Bridge]";

        // Command line argument keys
        private const string ARG_TARGET_GROUP = "-jaTargetGroup";
        private const string ARG_DEFINE = "-jaDefine";
        private const string ARG_BACKEND = "-jaBackend";
        private const string ARG_BUILD_TARGET = "-jaBuildTarget";

        /// <summary>
        /// No-op method to validate Unity project loads correctly
        /// </summary>
        public static void NoopValidate()
        {
            Log("NoopValidate: Unity project loaded successfully");
            Log($"Unity Version: {Application.unityVersion}");
            Log($"Project Path: {Application.dataPath}");
            EditorApplication.Exit(0);
        }

        /// <summary>
        /// Add a scripting define symbol to the specified build target group
        /// </summary>
        public static void AddDefineSymbol()
        {
            try
            {
                var args = Environment.GetCommandLineArgs();
                var targetGroup = GetArgValue(args, ARG_TARGET_GROUP);
                var symbol = GetArgValue(args, ARG_DEFINE);

                if (string.IsNullOrEmpty(targetGroup))
                {
                    LogError("Missing required argument: -jaTargetGroup");
                    EditorApplication.Exit(1);
                    return;
                }

                if (string.IsNullOrEmpty(symbol))
                {
                    LogError("Missing required argument: -jaDefine");
                    EditorApplication.Exit(1);
                    return;
                }

                var buildTargetGroup = ParseBuildTargetGroup(targetGroup);
                if (buildTargetGroup == BuildTargetGroup.Unknown)
                {
                    LogError($"Invalid target group: {targetGroup}");
                    EditorApplication.Exit(1);
                    return;
                }

                Log($"Adding define symbol '{symbol}' to target group '{targetGroup}'");

#if UNITY_2023_1_OR_NEWER
                var namedBuildTarget = GetNamedBuildTarget(buildTargetGroup);
                var currentDefines = PlayerSettings.GetScriptingDefineSymbols(namedBuildTarget);
#else
                var currentDefines = PlayerSettings.GetScriptingDefineSymbolsForGroup(buildTargetGroup);
#endif

                var definesList = currentDefines.Split(';').ToList();

                if (definesList.Contains(symbol))
                {
                    Log($"Symbol '{symbol}' already exists in target group '{targetGroup}'");
                }
                else
                {
                    definesList.Add(symbol);
                    var newDefines = string.Join(";", definesList.Where(d => !string.IsNullOrEmpty(d)));

#if UNITY_2023_1_OR_NEWER
                    PlayerSettings.SetScriptingDefineSymbols(namedBuildTarget, newDefines);
#else
                    PlayerSettings.SetScriptingDefineSymbolsForGroup(buildTargetGroup, newDefines);
#endif

                    Log($"Successfully added symbol '{symbol}' to target group '{targetGroup}'");
                    Log($"New defines: {newDefines}");
                }

                AssetDatabase.SaveAssets();
                EditorApplication.Exit(0);
            }
            catch (Exception ex)
            {
                LogError($"Failed to add define symbol: {ex.Message}\n{ex.StackTrace}");
                EditorApplication.Exit(1);
            }
        }

        /// <summary>
        /// Remove a scripting define symbol from the specified build target group
        /// </summary>
        public static void RemoveDefineSymbol()
        {
            try
            {
                var args = Environment.GetCommandLineArgs();
                var targetGroup = GetArgValue(args, ARG_TARGET_GROUP);
                var symbol = GetArgValue(args, ARG_DEFINE);

                if (string.IsNullOrEmpty(targetGroup))
                {
                    LogError("Missing required argument: -jaTargetGroup");
                    EditorApplication.Exit(1);
                    return;
                }

                if (string.IsNullOrEmpty(symbol))
                {
                    LogError("Missing required argument: -jaDefine");
                    EditorApplication.Exit(1);
                    return;
                }

                var buildTargetGroup = ParseBuildTargetGroup(targetGroup);
                if (buildTargetGroup == BuildTargetGroup.Unknown)
                {
                    LogError($"Invalid target group: {targetGroup}");
                    EditorApplication.Exit(1);
                    return;
                }

                Log($"Removing define symbol '{symbol}' from target group '{targetGroup}'");

#if UNITY_2023_1_OR_NEWER
                var namedBuildTarget = GetNamedBuildTarget(buildTargetGroup);
                var currentDefines = PlayerSettings.GetScriptingDefineSymbols(namedBuildTarget);
#else
                var currentDefines = PlayerSettings.GetScriptingDefineSymbolsForGroup(buildTargetGroup);
#endif

                var definesList = currentDefines.Split(';').ToList();

                if (!definesList.Contains(symbol))
                {
                    Log($"Symbol '{symbol}' does not exist in target group '{targetGroup}'");
                }
                else
                {
                    definesList.Remove(symbol);
                    var newDefines = string.Join(";", definesList.Where(d => !string.IsNullOrEmpty(d)));

#if UNITY_2023_1_OR_NEWER
                    PlayerSettings.SetScriptingDefineSymbols(namedBuildTarget, newDefines);
#else
                    PlayerSettings.SetScriptingDefineSymbolsForGroup(buildTargetGroup, newDefines);
#endif

                    Log($"Successfully removed symbol '{symbol}' from target group '{targetGroup}'");
                    Log($"New defines: {newDefines}");
                }

                AssetDatabase.SaveAssets();
                EditorApplication.Exit(0);
            }
            catch (Exception ex)
            {
                LogError($"Failed to remove define symbol: {ex.Message}\n{ex.StackTrace}");
                EditorApplication.Exit(1);
            }
        }

        /// <summary>
        /// Set scripting backend for the specified build target group
        /// </summary>
        public static void SetScriptingBackend()
        {
            try
            {
                var args = Environment.GetCommandLineArgs();
                var targetGroup = GetArgValue(args, ARG_TARGET_GROUP);
                var backend = GetArgValue(args, ARG_BACKEND);

                if (string.IsNullOrEmpty(targetGroup))
                {
                    LogError("Missing required argument: -aiideTargetGroup");
                    EditorApplication.Exit(1);
                    return;
                }

                if (string.IsNullOrEmpty(backend))
                {
                    LogError("Missing required argument: -aiideBackend");
                    EditorApplication.Exit(1);
                    return;
                }

                var buildTargetGroup = ParseBuildTargetGroup(targetGroup);
                if (buildTargetGroup == BuildTargetGroup.Unknown)
                {
                    LogError($"Invalid target group: {targetGroup}");
                    EditorApplication.Exit(1);
                    return;
                }

                ScriptingImplementation scriptingBackend;
                if (backend.Equals("Mono", StringComparison.OrdinalIgnoreCase) ||
                    backend.Equals("Mono2x", StringComparison.OrdinalIgnoreCase))
                {
                    scriptingBackend = ScriptingImplementation.Mono2x;
                }
                else if (backend.Equals("IL2CPP", StringComparison.OrdinalIgnoreCase))
                {
                    scriptingBackend = ScriptingImplementation.IL2CPP;
                }
                else
                {
                    LogError($"Invalid scripting backend: {backend}. Expected 'Mono' or 'IL2CPP'");
                    EditorApplication.Exit(1);
                    return;
                }

                Log($"Setting scripting backend to '{scriptingBackend}' for target group '{targetGroup}'");

                PlayerSettings.SetScriptingBackend(buildTargetGroup, scriptingBackend);

                Log($"Successfully set scripting backend to '{scriptingBackend}' for target group '{targetGroup}'");

                AssetDatabase.SaveAssets();
                EditorApplication.Exit(0);
            }
            catch (Exception ex)
            {
                LogError($"Failed to set scripting backend: {ex.Message}\n{ex.StackTrace}");
                EditorApplication.Exit(1);
            }
        }

        /// <summary>
        /// Switch active build target
        /// </summary>
        public static void SwitchBuildTarget()
        {
            try
            {
                var args = Environment.GetCommandLineArgs();
                var buildTargetStr = GetArgValue(args, ARG_BUILD_TARGET);

                if (string.IsNullOrEmpty(buildTargetStr))
                {
                    LogError("Missing required argument: -jaBuildTarget");
                    EditorApplication.Exit(1);
                    return;
                }

                BuildTarget buildTarget;
                BuildTargetGroup buildTargetGroup;

                if (!ParseBuildTarget(buildTargetStr, out buildTarget, out buildTargetGroup))
                {
                    LogError($"Invalid build target: {buildTargetStr}");
                    EditorApplication.Exit(1);
                    return;
                }

                Log($"Switching active build target to '{buildTarget}' (group: '{buildTargetGroup}')");

                var currentTarget = EditorUserBuildSettings.activeBuildTarget;
                if (currentTarget == buildTarget)
                {
                    Log($"Build target is already set to '{buildTarget}'");
                }
                else
                {
                    var success = EditorUserBuildSettings.SwitchActiveBuildTarget(buildTargetGroup, buildTarget);
                    if (success)
                    {
                        Log($"Successfully switched build target to '{buildTarget}'");
                    }
                    else
                    {
                        LogError($"Failed to switch build target to '{buildTarget}'. Check Unity console for errors.");
                        EditorApplication.Exit(1);
                        return;
                    }
                }

                AssetDatabase.SaveAssets();
                EditorApplication.Exit(0);
            }
            catch (Exception ex)
            {
                LogError($"Failed to switch build target: {ex.Message}\n{ex.StackTrace}");
                EditorApplication.Exit(1);
            }
        }

        // ==================== Helper Methods ====================

        private static string GetArgValue(string[] args, string key)
        {
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i].Equals(key, StringComparison.OrdinalIgnoreCase))
                {
                    return args[i + 1];
                }
            }
            return null;
        }

        private static BuildTargetGroup ParseBuildTargetGroup(string targetGroup)
        {
            if (targetGroup.Equals("Standalone", StringComparison.OrdinalIgnoreCase))
                return BuildTargetGroup.Standalone;
            if (targetGroup.Equals("Android", StringComparison.OrdinalIgnoreCase))
                return BuildTargetGroup.Android;
            if (targetGroup.Equals("iOS", StringComparison.OrdinalIgnoreCase))
                return BuildTargetGroup.iOS;
            if (targetGroup.Equals("WebGL", StringComparison.OrdinalIgnoreCase))
                return BuildTargetGroup.WebGL;

            return BuildTargetGroup.Unknown;
        }

        private static bool ParseBuildTarget(string buildTargetStr, out BuildTarget buildTarget, out BuildTargetGroup buildTargetGroup)
        {
            buildTarget = BuildTarget.NoTarget;
            buildTargetGroup = BuildTargetGroup.Unknown;

            if (buildTargetStr.Equals("Android", StringComparison.OrdinalIgnoreCase))
            {
                buildTarget = BuildTarget.Android;
                buildTargetGroup = BuildTargetGroup.Android;
                return true;
            }
            if (buildTargetStr.Equals("StandaloneWindows64", StringComparison.OrdinalIgnoreCase))
            {
                buildTarget = BuildTarget.StandaloneWindows64;
                buildTargetGroup = BuildTargetGroup.Standalone;
                return true;
            }
            if (buildTargetStr.Equals("StandaloneOSX", StringComparison.OrdinalIgnoreCase))
            {
                buildTarget = BuildTarget.StandaloneOSX;
                buildTargetGroup = BuildTargetGroup.Standalone;
                return true;
            }
            if (buildTargetStr.Equals("StandaloneLinux64", StringComparison.OrdinalIgnoreCase))
            {
                buildTarget = BuildTarget.StandaloneLinux64;
                buildTargetGroup = BuildTargetGroup.Standalone;
                return true;
            }
            if (buildTargetStr.Equals("iOS", StringComparison.OrdinalIgnoreCase))
            {
                buildTarget = BuildTarget.iOS;
                buildTargetGroup = BuildTargetGroup.iOS;
                return true;
            }
            if (buildTargetStr.Equals("WebGL", StringComparison.OrdinalIgnoreCase))
            {
                buildTarget = BuildTarget.WebGL;
                buildTargetGroup = BuildTargetGroup.WebGL;
                return true;
            }

            return false;
        }

#if UNITY_2023_1_OR_NEWER
        private static NamedBuildTarget GetNamedBuildTarget(BuildTargetGroup group)
        {
            switch (group)
            {
                case BuildTargetGroup.Standalone:
                    return NamedBuildTarget.Standalone;
                case BuildTargetGroup.Android:
                    return NamedBuildTarget.Android;
                case BuildTargetGroup.iOS:
                    return NamedBuildTarget.iOS;
                case BuildTargetGroup.WebGL:
                    return NamedBuildTarget.WebGL;
                default:
                    return NamedBuildTarget.Unknown;
            }
        }
#endif

        private static void Log(string message)
        {
            Debug.Log($"{LOG_PREFIX} {message}");
        }

        private static void LogError(string message)
        {
            Debug.LogError($"{LOG_PREFIX} ERROR: {message}");
        }
    }
}
#endif
