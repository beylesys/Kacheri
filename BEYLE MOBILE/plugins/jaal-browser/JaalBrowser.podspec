# BEYLE MOBILE/plugins/jaal-browser/JaalBrowser.podspec
# Slice S20: CocoaPods manifest for the JAAL Browser iOS Capacitor plugin.
#
# This podspec enables Capacitor to discover and link the plugin's
# Swift source files into the iOS app via CocoaPods.
#
# Local plugin — not published to a spec repo.

require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'JaalBrowser'
  s.version      = package['version']
  s.summary      = 'BEYLE JAAL Research Browser — Native iOS WKWebView plugin for Capacitor'
  s.homepage     = 'https://beyle.app'
  s.license      = { :type => 'UNLICENSED' }
  s.author       = 'BEYLE'
  s.source       = { :path => './' }
  s.source_files = 'ios/Plugin/**/*.swift'

  s.ios.deployment_target = '13.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
