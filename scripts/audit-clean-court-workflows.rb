# Report-only inventory; equal command fingerprints are not proof of redundant jobs.
require 'yaml'
require 'digest'
require 'json'
files=Dir.glob('.github/workflows/*.{yml,yaml}').sort
groups=Hash.new{|h,k| h[k]=[]}
commands=Hash.new{|h,k| h[k]=[]}
schedules=[]
files.each do |file|
  doc=YAML.safe_load(File.read(file),aliases:true)
  raise "Invalid workflow: #{file}" unless doc.is_a?(Hash)
  events=doc['on'] || doc[true] || {}
  if events.is_a?(Hash) && events['schedule']
    schedules << {file:file,cron:Array(events['schedule']).filter_map{|x| x['cron']}}
  end
  (doc['jobs']||{}).each do |name,job|
    steps=Array(job['steps']).select{|s| s.is_a?(Hash)}
    next if steps.empty?
    payload=steps.map{|s| s.reject{|k,v| k=='name'}}
    fp=Digest::SHA256.hexdigest(JSON.generate(payload))
    groups[fp] << "#{file}:#{name}"
    steps.each do |s|
      next unless s['run'].is_a?(String)
      cmd=s['run'].strip
      next if cmd.empty?
      commands[Digest::SHA256.hexdigest(cmd)] << "#{file}:#{name}"
    end
  end
end
dups=groups.values.select{|a| a.uniq.size>1}.map(&:uniq)
shared=commands.values.map(&:uniq).select{|a| a.size>1}
puts JSON.pretty_generate({workflow_count:files.length,scheduled:schedules,identical_step_sequences:dups,shared_command_groups:shared.length,largest_shared_command_groups:shared.sort_by{|a| -a.size}.first(15)})
puts 'PASS workflow inventory; no schedules or workflows changed'
