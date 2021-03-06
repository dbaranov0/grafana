define([
  'angular',
  'lodash',
  'kbn',
],
function (angular, _, kbn) {
  'use strict';

  var module = angular.module('grafana.services');

  module.service('templateValuesSrv', function($q, $rootScope, datasourceSrv, $routeParams, templateSrv) {
    var self = this;

    this.init = function(dashboard) {
      this.variables = dashboard.templating.list;

      templateSrv.init(this.variables);

      for (var i = 0; i < this.variables.length; i++) {
        var param = this.variables[i];
        if (param.refresh) {
          this.updateOptions(param);
        }
      }
    };

    this.setVariableValue = function(variable, option, recursive) {
      variable.current = option;

      templateSrv.updateTemplateData();

      return this.updateOptionsInChildVariables(variable)
        .then(function() {
          if (!recursive) {
            $rootScope.$broadcast('refresh');
          }
        });
    };

    this.updateOptionsInChildVariables = function(updatedVariable) {
      var promises = _.map(self.variables, function(otherVariable) {
        if (otherVariable === updatedVariable) {
          return;
        }
        if (otherVariable.query.indexOf('[[' + updatedVariable.name + ']]') !== -1) {
          return self.updateOptions(otherVariable);
        }
      });

      return $q.all(promises);
    };

    this.updateOptions = function(variable) {
      if (variable.type === 'time period') {
        variable.options = _.map(variable.query.split(','), function(text) {
          return { text: text, value: text };
        });
        self.setVariableValue(variable, variable.options[0]);
        return;
      }

      var datasource = datasourceSrv.get(variable.datasource);
      return datasource.metricFindQuery(variable.query)
        .then(function (results) {

          variable.options = self.metricNamesToVariableValues(variable, results);

          if (variable.includeAll) {
            self.addAllOption(variable);
          }

          // if parameter has current value
          // if it exists in options array keep value
          if (variable.current) {
            var currentExists = _.findWhere(variable.options, { value: variable.current.value });
            if (currentExists) {
              return self.setVariableValue(variable, variable.current, true);
            }
          }

          return self.setVariableValue(variable, variable.options[0], true);
        });
    };

    this.metricNamesToVariableValues = function(variable, metricNames) {
      var regex, options, i, matches;
      options = {}; // use object hash to remove duplicates

      if (variable.regex) {
        regex = kbn.stringToJsRegex(variable.regex);
      }

      for (i = 0; i < metricNames.length; i++) {
        var value = metricNames[i].text;

        if (regex) {
          matches = regex.exec(value);
          if (!matches) { continue; }
          if (matches.length > 1) {
            value = matches[1];
          }
        }

        options[value] = value;
      }

      return _.map(_.keys(options), function(key) {
        return { text: key, value: key };
      });
    };

    this.addAllOption = function(variable) {
      var allValue = '';
      switch(variable.allFormat) {
      case 'wildcard':
        allValue = '*';
        break;
      case 'regex wildcard':
        allValue = '.*';
        break;
      default:
        allValue = '{';
        _.each(variable.options, function(option) {
          allValue += option.text + ',';
        });
        allValue = allValue.substring(0, allValue.length - 1) + '}';
      }

      variable.options.unshift({text: 'All', value: allValue});
    };

  });

});
